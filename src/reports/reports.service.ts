import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { buildDirectorConsolidation, groupPaymentsByDirector } from "./director-consolidation";

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  byGame(gameId: string) {
    return this.prisma.transaction.groupBy({
      by: ["type"],
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
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } } : {}),
    };
    const transactions = await this.prisma.transaction.findMany({
      where: transactionWhere,
      orderBy: [{ game: { date: "desc" } }, { createdAt: "desc" }],
      include: { game: true, category: true, director: true },
    });
    const grouped = new Map<string, { game: { id: string; date: Date; opponent: string | null; location: string | null; status: string }; transactions: Array<{ id: string; type: string; amount: number; paymentMethod: string; notes: string | null; createdAt: Date; date: Date; category: string | null; categoryType: string | null; director: string | null }> }>();

    for (const transaction of transactions) {
      const entry = grouped.get(transaction.gameId) ?? {
        game: { id: transaction.game.id, date: transaction.game.date, opponent: transaction.game.opponent, location: transaction.game.location, status: transaction.game.status },
        transactions: [],
      };
      entry.transactions.push({
        id: transaction.id, type: transaction.type, amount: Number(transaction.amount), paymentMethod: transaction.paymentMethod,
        notes: transaction.notes, createdAt: transaction.createdAt, date: transaction.date,
        category: transaction.category?.name ?? null, categoryType: transaction.category?.type ?? null, director: transaction.director?.name ?? null,
      });
      grouped.set(transaction.gameId, entry);
    }

    return Array.from(grouped.values()).map((entry) => {
      const entradas = entry.transactions.filter((transaction) => transaction.type === "ENTRADA").reduce((sum, transaction) => sum + transaction.amount, 0);
      const saidas = entry.transactions.filter((transaction) => transaction.type === "SAIDA").reduce((sum, transaction) => sum + transaction.amount, 0);
      return { game: entry.game, totals: { entradas, saidas, saldo: entradas - saidas }, transactions: entry.transactions };
    });
  }

  async consolidatedByDirector(from?: string, to?: string, expectedPerGame = 70) {
    const dateFilter = from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } } : {};
    const [games, directors, paymentsRaw] = await Promise.all([
      this.prisma.game.findMany({ where: dateFilter, orderBy: { date: "asc" }, select: { id: true, date: true, opponent: true, location: true } }),
      this.prisma.director.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, contact: true } }),
      this.prisma.transaction.findMany({
        where: { type: "ENTRADA", category: { name: "Diretoria" }, ...dateFilter },
        include: { game: { select: { id: true, date: true, opponent: true, location: true } }, category: { select: { name: true, type: true } } },
        orderBy: { createdAt: "desc" },
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
