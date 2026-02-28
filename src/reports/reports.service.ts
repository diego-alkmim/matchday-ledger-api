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
}
