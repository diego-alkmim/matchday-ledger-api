import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildDirectorConsolidation,
  groupPaymentsByDirector,
} from './director-consolidation';
import { AnalyticalByGameQueryDto } from './dto/analytical-by-game-query.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  byGame(gameId: string, teamId: string) {
    return this.prisma.transaction.groupBy({
      by: ['type'],
      where: { gameId, teamId },
      _sum: { amount: true },
    });
  }

  monthly(from: string, to: string, teamId: string) {
    return this.prisma.$queryRaw`
      SELECT
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM') as month_label,
        date_trunc('month', "createdAt") as month,
        SUM(CASE WHEN type='ENTRADA' THEN amount ELSE 0 END) as entradas,
        SUM(CASE WHEN type='SAIDA' THEN amount ELSE 0 END) as saidas
      FROM "Transaction"
      WHERE "teamId" = ${teamId}
        AND "createdAt" >= ${from}::date
        AND "createdAt" < (${to}::date + INTERVAL '1 day')
      GROUP BY 1,2
      ORDER BY 2;
    `;
  }

  byCategory(from: string, to: string, teamId: string) {
    return this.prisma.$queryRaw`
      SELECT c.name, SUM(t.amount) as total
      FROM "Transaction" t
      JOIN "Category" c ON c.id = t."categoryId"
      WHERE t."teamId" = ${teamId}
        AND t.date >= ${from}::date
        AND t.date < (${to}::date + INTERVAL '1 day')
      GROUP BY c.name;
    `;
  }

  async analyticalByGame(query: AnalyticalByGameQueryDto, teamId: string) {
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const transactionWhere: Prisma.TransactionWhereInput = {
      teamId,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from
                ? { gte: new Date(`${query.from}T00:00:00.000Z`) }
                : {}),
              ...(query.to
                ? { lte: new Date(`${query.to}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };
    const gameWhere: Prisma.GameWhereInput = query.gameId
      ? { id: query.gameId, teamId, transactions: { some: transactionWhere } }
      : { teamId, transactions: { some: transactionWhere } };
    const findManyArgs = {
      where: gameWhere,
      orderBy: { date: 'desc' } as const,
      ...(paginated
        ? { skip: (page - 1) * pageSize, take: pageSize }
        : {}),
      select: {
          id: true,
          date: true,
          opponent: true,
          location: true,
          status: true,
          transactions: {
            where: transactionWhere,
            orderBy: { createdAt: 'desc' as const },
            select: {
              id: true,
              type: true,
              amount: true,
              paymentMethod: true,
              notes: true,
              createdAt: true,
              date: true,
              category: { select: { name: true, type: true } },
              director: { select: { name: true } },
            },
          },
      },
    } satisfies Prisma.GameFindManyArgs;
    const games = await this.prisma.game.findMany(findManyArgs);
    const total = paginated
      ? await this.prisma.game.count({ where: gameWhere })
      : 0;
    const items = games.map((game) => {
      const transactions = game.transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: Number(transaction.amount),
        paymentMethod: transaction.paymentMethod,
        notes: transaction.notes,
        createdAt: transaction.createdAt,
        date: transaction.date,
        category: transaction.category?.name ?? null,
        categoryType: transaction.category?.type ?? null,
        director: transaction.director?.name ?? null,
      }));
      const entradas = transactions
        .filter((transaction) => transaction.type === 'ENTRADA')
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const saidas = transactions
        .filter((transaction) => transaction.type === 'SAIDA')
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      return {
        game: {
          id: game.id,
          date: game.date,
          opponent: game.opponent,
          location: game.location,
          status: game.status,
        },
        totals: { entradas, saidas, saldo: entradas - saidas },
        transactions,
      };
    });

    return paginated
      ? { items, pagination: buildPaginationMeta(page, pageSize, total) }
      : items;
  }

  async consolidatedByDirector(
    from: string | undefined,
    to: string | undefined,
    expectedPerGame: number,
    teamId: string,
  ) {
    const dateFilter = from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } } : {};
    const [games, directors, paymentsRaw] = await Promise.all([
      this.prisma.game.findMany({ where: { teamId, ...dateFilter }, orderBy: { date: 'asc' }, select: { id: true, date: true, opponent: true, location: true } }),
      this.prisma.director.findMany({ where: { teamId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, contact: true } }),
      this.prisma.transaction.findMany({
        where: { teamId, type: 'ENTRADA', category: { name: 'Diretoria' }, ...dateFilter },
        include: { game: { select: { id: true, date: true, opponent: true, location: true } }, category: { select: { name: true, type: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const paymentsByDirector = groupPaymentsByDirector(directors, paymentsRaw);

    return {
      summary: { gamesCount: games.length, expectedPerGame, expectedTotalPerDirector: games.length * expectedPerGame },
      games,
      directors: directors.map((director) => buildDirectorConsolidation(director, games, paymentsByDirector.get(director.id) ?? [], expectedPerGame)),
    };
  }
}
