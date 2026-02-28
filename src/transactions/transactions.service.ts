import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameStatus, Role, TransactionType } from '@prisma/client';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  private normalizeDate(input: any): Date | undefined {
    if (!input) return undefined;
    if (input instanceof Date) return input;
    if (typeof input === 'string') {
      const iso = input.includes('T') ? input : `${input}T00:00:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
    }
    return undefined;
  }

  list() {
    return this.prisma.transaction.findMany({ include: { game: true, category: true, director: true } });
  }

  async create(data: any, user: any) {
    const game = await this.prisma.game.findUnique({ where: { id: data.gameId } });
    if (!game) throw new ForbiddenException('Game not found');
    if (game.status === GameStatus.FECHADO && user.role !== Role.ADMIN) throw new ForbiddenException('Game closed');

    const parsedDate = this.normalizeDate(data.date);
    if (!parsedDate) throw new ForbiddenException('Data inválida');
    data.date = parsedDate;

    if (user.role === Role.DIRETOR) {
      if (data.type !== TransactionType.ENTRADA) throw new ForbiddenException('Diretor só lança entrada');
      data.directorId = user.directorId;
    }
    data.createdByUserId = user.sub;
    return this.prisma.transaction.create({ data });
  }

  async update(id: string, data: any, user: any) {
    const tx = await this.prisma.transaction.findUnique({ where: { id }, include: { game: true } });
    if (!tx) throw new ForbiddenException();
    if (tx.game.status === GameStatus.FECHADO && user.role !== Role.ADMIN) throw new ForbiddenException('Game closed');
    if (user.role === Role.DIRETOR && tx.type !== TransactionType.ENTRADA) throw new ForbiddenException();

    const parsedDate = this.normalizeDate(data.date);
    if (data.date && !parsedDate) throw new ForbiddenException('Data inválida');
    if (parsedDate) data.date = parsedDate;

    return this.prisma.transaction.update({ where: { id }, data });
  }

  remove(id: string) { return this.prisma.transaction.delete({ where: { id } }); }
}
