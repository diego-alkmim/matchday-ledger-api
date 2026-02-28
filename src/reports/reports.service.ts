import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  byGame(gameId: string) {
    return this.prisma.transaction.groupBy({
      by: ['type'],
      where: { gameId },
      _sum: { amount: true },
    });
  }

  monthly(from: string, to: string) {
    return this.prisma.$queryRaw`
      SELECT date_trunc('month', date) as month,
        SUM(CASE WHEN type='ENTRADA' THEN amount ELSE 0 END) as entradas,
        SUM(CASE WHEN type='SAIDA' THEN amount ELSE 0 END) as saidas
      FROM "Transaction"
      WHERE date BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1 ORDER BY 1;
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
}
