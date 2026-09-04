import { Injectable } from '@nestjs/common';
import { GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.game.findMany();
  }

  create(data: CreateGameDto) {
    return this.prisma.game.create({ data });
  }

  update(id: string, data: UpdateGameDto) {
    return this.prisma.game.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.game.delete({ where: { id } });
  }

  setStatus(id: string, status: GameStatus) {
    return this.prisma.game.update({ where: { id }, data: { status } });
  }
}
