import { Injectable, NotFoundException } from '@nestjs/common';
import { Game, GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { domainErrors } from '../common/errors/domain-errors';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  async list(teamId: string) {
    const games = await this.prisma.game.findMany({
      where: { teamId },
      orderBy: { date: 'desc' },
    });
    return games.map((game) => this.normalize(game));
  }

  async create(data: CreateGameDto, teamId: string) {
    const game = await this.prisma.game.create({ data: { ...data, teamId } });
    return this.normalize(game);
  }

  async update(id: string, data: UpdateGameDto, teamId: string) {
    await this.assertExists(id, teamId);
    const game = await this.prisma.game.update({
      where: { id_teamId: { id, teamId } },
      data,
    });
    return this.normalize(game);
  }

  async remove(id: string, teamId: string) {
    await this.assertExists(id, teamId);
    const game = await this.prisma.game.delete({ where: { id_teamId: { id, teamId } } });
    return this.normalize(game);
  }

  async setStatus(id: string, status: GameStatus, teamId: string) {
    const game = await this.prisma.game.findUnique({ where: { id_teamId: { id, teamId } } });
    if (!game) throw new NotFoundException(domainErrors.gameNotFound);
    const updated = await this.prisma.game.update({
      where: { id_teamId: { id, teamId } },
      data: { status },
    });
    return this.normalize(updated);
  }

  private async assertExists(id: string, teamId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id_teamId: { id, teamId } },
      select: { id: true },
    });
    if (!game) throw new NotFoundException(domainErrors.gameNotFound);
  }

  private normalize(game: Game) {
    return {
      ...game,
      expectedContributionPerDirector: Number(game.expectedContributionPerDirector),
    };
  }
}
