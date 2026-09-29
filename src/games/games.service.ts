import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Game, GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { domainErrors } from '../common/errors/domain-errors';
import { CollectionsGenerationService } from '../collections/collections-generation.service';
import { CollectionsLedgerService } from '../collections/collections-ledger.service';
import { CollectionsReconciliationService } from '../collections/collections-reconciliation.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private reconciliation: CollectionsReconciliationService,
    private generation: CollectionsGenerationService,
    private ledger: CollectionsLedgerService,
  ) {}

  async list(teamId: string) {
    const games = await this.prisma.game.findMany({
      where: { teamId },
      orderBy: { date: 'desc' },
    });
    return games.map((game) => this.normalize(game));
  }

  async create(data: CreateGameDto, teamId: string) {
    const game = await this.reconciliation.runSerializable(async (tx) => {
      const game = await tx.game.create({ data: { ...data, teamId } });
      await this.generateGameObligations(tx, teamId, game.date);
      return game;
    });
    return this.normalize(game);
  }

  async update(id: string, data: UpdateGameDto, teamId: string) {
    const game = await this.reconciliation.runSerializable(async (tx) => {
      const current = await tx.game.findUnique({ where: { id_teamId: { id, teamId } } });
      if (!current) throw new NotFoundException(domainErrors.gameNotFound);
      const financialChange = data.date !== undefined || data.expectedContributionPerDirector !== undefined;
      if (financialChange) {
        const [transactions, obligations] = await Promise.all([
          tx.transaction.count({ where: { teamId, gameId: id } }),
          tx.collectionObligation.findMany({
            where: { teamId, gameId: id },
            select: { _count: { select: { allocations: true, adjustments: true } } },
          }),
        ]);
        if (transactions > 0 || obligations.some((item) => item._count.allocations > 0 || item._count.adjustments > 0)) {
          throw new BadRequestException('Não é possível alterar data ou valor de um jogo com movimentação financeira.');
        }
        await tx.collectionObligation.deleteMany({ where: { teamId, gameId: id } });
      }
      const updated = await tx.game.update({ where: { id_teamId: { id, teamId } }, data });
      if (financialChange) await this.generateGameObligations(tx, teamId, updated.date);
      return updated;
    });
    return this.normalize(game);
  }

  async remove(id: string, teamId: string) {
    const game = await this.reconciliation.runSerializable(async (tx) => {
      const game = await tx.game.findUnique({ where: { id_teamId: { id, teamId } } });
      if (!game) throw new NotFoundException(domainErrors.gameNotFound);
      const [transactions, obligations] = await Promise.all([
        tx.transaction.count({ where: { teamId, gameId: id } }),
        tx.collectionObligation.findMany({
          where: { teamId, gameId: id },
          select: { _count: { select: { allocations: true, adjustments: true } } },
        }),
      ]);
      if (transactions > 0 || obligations.some((item) => item._count.allocations > 0 || item._count.adjustments > 0)) {
        throw new BadRequestException('Não é possível excluir um jogo com movimentação financeira.');
      }
      await tx.collectionObligation.deleteMany({ where: { teamId, gameId: id } });
      return tx.game.delete({ where: { id_teamId: { id, teamId } } });
    });
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

  private normalize(game: Game) {
    return {
      ...game,
      expectedContributionPerDirector: Number(game.expectedContributionPerDirector),
    };
  }

  private async generateGameObligations(
    tx: Parameters<CollectionsGenerationService['generateInTransaction']>[0],
    teamId: string,
    date: Date,
  ) {
    const day = date.toISOString().slice(0, 10);
    await this.generation.generateInTransaction(tx, teamId, day, day);
    await this.ledger.applyAvailableCreditsInTransaction(tx, teamId);
  }
}
