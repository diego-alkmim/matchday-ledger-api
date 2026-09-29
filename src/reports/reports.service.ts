import { Injectable } from '@nestjs/common';
import { ContributionMode, Prisma } from '@prisma/client';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildContributionObligations,
  groupPaymentsByDirector,
} from './director-consolidation';
import { AnalyticalByGameQueryDto } from './dto/analytical-by-game-query.dto';
import { CollectionsDirectorReportService } from './collections-director-report.service';
import { buildHistoricalDirectorEntries, historicalDirectorSelect } from './historical-directors';
import { assertBoundedDateRange } from '../common/validation/bounded-date-range';

function buildContributionDateFilter(
  from: string | undefined,
  to: string | undefined,
  mode: ContributionMode,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  let start = from ? new Date(`${from}T00:00:00.000-03:00`) : undefined;
  let end = to ? new Date(`${to}T23:59:59.999-03:00`) : undefined;

  if (mode === ContributionMode.MONTHLY) {
    if (from) start = new Date(`${from.slice(0, 7)}-01T00:00:00.000-03:00`);
    if (to) {
      const [year, month] = to.split('-').map(Number);
      end = new Date(Date.UTC(year, month, 1, 3) - 1);
    }
  }

  return { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private collectionsDirectorReport: CollectionsDirectorReportService,
  ) {}

  byGame(gameId: string, teamId: string) {
    return this.prisma.transaction.groupBy({
      by: ['type'],
      where: { gameId, teamId, reversedAt: null },
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
        AND "reversedAt" IS NULL
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
        AND t."reversedAt" IS NULL
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
      reversedAt: null,
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
    from: string,
    to: string,
    teamId: string,
  ) {
    assertBoundedDateRange(from, to);
    const collectionsReport = await this.collectionsDirectorReport.build(teamId, from, to);
    if (collectionsReport) return collectionsReport;

    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { contributionMode: true, monthlyContributionPerDirector: true },
    });
    const gameDateFilter = buildContributionDateFilter(from, to, team.contributionMode);
    const [games, directors, paymentsRaw] = await Promise.all([
      this.prisma.game.findMany({
        where: { teamId, ...(gameDateFilter ? { date: gameDateFilter } : {}) },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          opponent: true,
          location: true,
          expectedContributionPerDirector: true,
        },
      }),
      this.prisma.director.findMany({
        where: { teamId },
        orderBy: { name: 'asc' },
        select: historicalDirectorSelect,
      }),
      this.prisma.transaction.findMany({
        where: {
          teamId,
          reversedAt: null,
          type: 'ENTRADA',
          gameId: { not: null },
          category: { name: 'Diretoria' },
          ...(gameDateFilter ? { game: { date: gameDateFilter } } : {}),
        },
        include: { game: { select: { id: true, date: true, opponent: true, location: true } }, category: { select: { name: true, type: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const monthlyContributionPerDirector = Number(team.monthlyContributionPerDirector);
    const obligations = buildContributionObligations(
      games,
      team.contributionMode,
      monthlyContributionPerDirector,
    );
    const paymentsByDirector = groupPaymentsByDirector(directors, paymentsRaw);
    const directorEntries = buildHistoricalDirectorEntries(
      directors,
      obligations,
      paymentsByDirector,
      team.contributionMode,
    );
    const expectedTotalPerDirector = directorEntries.length
      ? Math.round(
        (directorEntries.reduce((sum, director) => sum + director.totals.expectedTotal, 0) /
          directorEntries.length) * 100,
      ) / 100
      : 0;

    return {
      summary: {
        mode: team.contributionMode,
        gamesCount: games.length,
        obligationsCount: directorEntries.reduce((sum, item) => sum + item.totals.obligationsCount, 0),
        monthlyContributionPerDirector:
          team.contributionMode === 'MONTHLY' ? monthlyContributionPerDirector : null,
        expectedTotalPerDirector,
      },
      games,
      obligations,
      directors: directorEntries,
    };
  }
}
