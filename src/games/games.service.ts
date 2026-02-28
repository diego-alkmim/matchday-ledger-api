import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameStatus } from '@prisma/client';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.game.findMany(); }
  create(data: any) { return this.prisma.game.create({ data }); }
  update(id: string, data: any) { return this.prisma.game.update({ where: { id }, data }); }
  remove(id: string) { return this.prisma.game.delete({ where: { id } }); }
  setStatus(id: string, status: GameStatus) { return this.prisma.game.update({ where: { id }, data: { status } }); }
}
