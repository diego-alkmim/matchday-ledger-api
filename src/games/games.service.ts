import { Injectable, NotFoundException } from '@nestjs/common';
import { GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { domainErrors } from '../common/errors/domain-errors';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  list(teamId: string) {
    return this.prisma.game.findMany({ where: { teamId }, orderBy: { date: 'desc' } });
  }

  create(data: CreateGameDto, teamId: string) {
    return this.prisma.game.create({ data: { ...data, teamId } });
  }

  async update(id: string, data: UpdateGameDto, teamId: string) {
    await this.assertExists(id, teamId);
    return this.prisma.game.update({ where: { id_teamId: { id, teamId } }, data });
  }

  async remove(id: string, teamId: string) {
    await this.assertExists(id, teamId);
    return this.prisma.game.delete({ where: { id_teamId: { id, teamId } } });
  }

  async setStatus(id: string, status: GameStatus, teamId: string) {
    const game = await this.prisma.game.findUnique({ where: { id_teamId: { id, teamId } } });
    if (!game) throw new NotFoundException(domainErrors.gameNotFound);
    return this.prisma.game.update({ where: { id_teamId: { id, teamId } }, data: { status } });
  }

  private async assertExists(id: string, teamId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id_teamId: { id, teamId } },
      select: { id: true },
    });
    if (!game) throw new NotFoundException(domainErrors.gameNotFound);
  }
}
