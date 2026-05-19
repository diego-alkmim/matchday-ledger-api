import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AnalyticalGroupedTransaction = {
  id: string;
  type: string;
  amount: number;
  paymentMethod: string;
  notes: string | null;
  createdAt: Date;
  date: Date;
  category: string | null;
  categoryType: string | null;
  director: string | null;
};

type AnalyticalGroupedGame = {
  game: {
    id: string;
    date: Date;
    opponent: string | null;
    location: string | null;
    status: string;
  };
  transactions: AnalyticalGroupedTransaction[];
};

type DirectorPayment = {
  id: string;
  amount: number;
  createdAt: Date;
  date: Date;
  notes: string | null;
  paymentMethod: string;
  game: {
    id: string;
    date: Date;
    opponent: string | null;
    location: string | null;
  } | null;
  category: string | null;
};

type MissingGame = {
  game: {
    id: string;
    date: Date;
    opponent: string | null;
    location: string | null;
  };
  expectedAmount: number;
  paidAmount: number;
  appliedOwnGameAmount: number;
  appliedFromFutureExcess: number;
  appliedTotal: number;
  missingAmount: number;
  settled: boolean;
  coveredByFutureExcess: boolean;
};

type DirectorGameStatus = {
  game: {
    id: string;
    date: Date;
    opponent: string | null;
    location: string | null;
  };
  expectedAmount: number;
  paidAmount: number;
  appliedOwnGameAmount: number;
  appliedFromFutureExcess: number;
  appliedTotal: number;
  missingAmount: number;
  settled: boolean;
  coveredByFutureExcess: boolean;
  ownExcess: number;
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private normalizeName(value?: string | null) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  byGame(gameId: string) {
    return this.prisma.transaction.groupBy({
      by: ['type'],
      where: { gameId },
      _sum: { amount: true },
    });
  }

  monthly(from: string, to: string) {
    return this.prisma.$queryRaw`
      SELECT 
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM') as month_label,
        date_trunc('month', "createdAt") as month,
        SUM(CASE WHEN type='ENTRADA' THEN amount ELSE 0 END) as entradas,
        SUM(CASE WHEN type='SAIDA' THEN amount ELSE 0 END) as saidas
      FROM "Transaction"
      WHERE "createdAt" BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1,2
      ORDER BY 2;
    `;
  }

  byCategory(from: string, to: string) {
    return this.prisma.$queryRaw`
      SELECT c.name, SUM(t.amount) as total
      FROM "Transaction" t
      JOIN "Category" c ON c.id = t."categoryId"
      WHERE t.date BETWEEN ${from}::date AND ${to}::date
      GROUP BY c.name;
    `;
  }

  async analyticalByGame(from?: string, to?: string, gameId?: string) {
    const transactionWhere = {
      ...(gameId ? { gameId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const transactions = await this.prisma.transaction.findMany({
      where: transactionWhere,
      orderBy: [{ game: { date: 'desc' } }, { createdAt: 'desc' }],
      include: {
        game: true,
        category: true,
        director: true,
      },
    });

    const grouped = new Map<string, AnalyticalGroupedGame>();

    for (const transaction of transactions) {
      const current = grouped.get(transaction.gameId) ?? {
        game: {
          id: transaction.game.id,
          date: transaction.game.date,
          opponent: transaction.game.opponent,
          location: transaction.game.location,
          status: transaction.game.status,
        },
        transactions: [],
      };

      current.transactions.push({
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
      });

      grouped.set(transaction.gameId, current);
    }

    return Array.from(grouped.values()).map((entry) => {
      const transactions = entry.transactions;

      const totalEntradas = transactions
        .filter((transaction) => transaction.type === 'ENTRADA')
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      const totalSaidas = transactions
        .filter((transaction) => transaction.type === 'SAIDA')
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      return {
        game: entry.game,
        totals: {
          entradas: totalEntradas,
          saidas: totalSaidas,
          saldo: totalEntradas - totalSaidas,
        },
        transactions,
      };
    });
  }

  async consolidatedByDirector(from?: string, to?: string, expectedPerGame = 70) {
    const gameWhere = from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {};

    const transactionWhere = {
      type: 'ENTRADA' as const,
      category: {
        name: 'Diretoria',
      },
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [games, directors, paymentsRaw] = await Promise.all([
      this.prisma.game.findMany({
        where: gameWhere,
        orderBy: { date: 'asc' },
        select: { id: true, date: true, opponent: true, location: true },
      }),
      this.prisma.director.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, contact: true },
      }),
      this.prisma.transaction.findMany({
        where: transactionWhere,
        include: {
          game: {
            select: { id: true, date: true, opponent: true, location: true },
          },
          category: {
            select: { name: true, type: true },
          },
          director: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const gamesCount = games.length;
    const paymentsByDirector = new Map<string, DirectorPayment[]>();
    const directorsByNormalizedName = new Map(
      directors.map((director) => [this.normalizeName(director.name), director.id]),
    );

    for (const payment of paymentsRaw) {
      const fallbackDirectorId = directorsByNormalizedName.get(
        this.normalizeName(payment.notes),
      );
      const targetDirectorId = payment.directorId || fallbackDirectorId;
      if (!targetDirectorId) continue;
      const current = paymentsByDirector.get(targetDirectorId) ?? [];
      current.push({
        id: payment.id,
        amount: Number(payment.amount),
        createdAt: payment.createdAt,
        date: payment.date,
        notes: payment.notes,
        paymentMethod: payment.paymentMethod,
        game: payment.game,
        category: payment.category?.name ?? null,
      });
      paymentsByDirector.set(targetDirectorId, current);
    }

    return {
      summary: {
        gamesCount,
        expectedPerGame,
        expectedTotalPerDirector: gamesCount * expectedPerGame,
      },
      games,
      directors: directors.map((director) => {
        const directorPayments = paymentsByDirector.get(director.id) ?? [];
        const payments = directorPayments;
        const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
        const expectedTotal = gamesCount * expectedPerGame;
        const gameTotals = new Map<string, number>();

        for (const payment of payments) {
          if (!payment.game?.id) continue;
          const current = gameTotals.get(payment.game.id) ?? 0;
          gameTotals.set(payment.game.id, current + payment.amount);
        }

        const gameStatuses: DirectorGameStatus[] = games.map((game) => {
          const paidAmount = gameTotals.get(game.id) ?? 0;
          const appliedOwnGameAmount = Math.min(paidAmount, expectedPerGame);
          const missingAmount = Math.max(expectedPerGame - appliedOwnGameAmount, 0);

          return {
            game: {
              id: game.id,
              date: game.date,
              opponent: game.opponent,
              location: game.location,
            },
            expectedAmount: expectedPerGame,
            paidAmount,
            appliedOwnGameAmount,
            appliedFromFutureExcess: 0,
            appliedTotal: appliedOwnGameAmount,
            missingAmount,
            settled: missingAmount === 0,
            coveredByFutureExcess: false,
            ownExcess: Math.max(paidAmount - expectedPerGame, 0),
          };
        });

        for (let sourceIndex = 0; sourceIndex < gameStatuses.length; sourceIndex += 1) {
          let excessRemaining = gameStatuses[sourceIndex].ownExcess;

          if (excessRemaining <= 0) continue;

          for (
            let targetIndex = 0;
            targetIndex < sourceIndex && excessRemaining > 0;
            targetIndex += 1
          ) {
            const target = gameStatuses[targetIndex];
            if (target.missingAmount <= 0) continue;

            const appliedAmount = Math.min(excessRemaining, target.missingAmount);
            target.appliedFromFutureExcess += appliedAmount;
            target.appliedTotal += appliedAmount;
            target.missingAmount -= appliedAmount;
            target.settled = target.missingAmount === 0;
            target.coveredByFutureExcess = target.appliedFromFutureExcess > 0;
            excessRemaining -= appliedAmount;
          }
        }

        const missingGames: MissingGame[] = gameStatuses.filter(
          (gameStatus) => gameStatus.missingAmount > 0,
        );

        const paidGamesCount = gameStatuses.filter((gameStatus) => gameStatus.settled).length;
        const delta = totalPaid - expectedTotal;
        const hasPendingGames = missingGames.length > 0;

        return {
          director: {
            id: director.id,
            name: director.name,
            contact: director.contact,
          },
          totals: {
            gamesCount,
            paidGamesCount,
            expectedPerGame,
            expectedTotal,
            totalPaid,
            delta,
          },
          status: hasPendingGames ? 'PENDENTE' : delta > 0 ? 'ACIMA' : 'EM_DIA',
          gameStatuses: gameStatuses.map(({ ownExcess: _ownExcess, ...gameStatus }) => gameStatus),
          missingGames,
          payments,
        };
      }),
    };
  }
}
