import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdjustmentType,
  CollectionFrequency,
  Game,
  GameStatus,
  MemberRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { domainErrors } from '../common/errors/domain-errors';
import { CollectionsGenerationService } from '../collections/collections-generation.service';
import { CollectionsLedgerService } from '../collections/collections-ledger.service';
import { CollectionsReconciliationService } from '../collections/collections-reconciliation.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { ListGamesQueryDto } from './dto/list-games-query.dto';
import { CorrectGameFinancialValueDto } from './dto/correct-game-financial-value.dto';
import { assertOptionalBoundedDateRange } from '../common/validation/bounded-date-range';

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private reconciliation: CollectionsReconciliationService,
    private generation: CollectionsGenerationService,
    private ledger: CollectionsLedgerService,
  ) {}

  async list(teamId: string, query: ListGamesQueryDto = new ListGamesQueryDto()) {
    assertOptionalBoundedDateRange(query.from, query.to);
    assertOptionalBoundedDateRange(query.activityFrom, query.activityTo);
    const date = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000-03:00`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999-03:00`) } : {}),
    };
    const activityDate = {
      ...(query.activityFrom ? { gte: new Date(`${query.activityFrom}T00:00:00.000-03:00`) } : {}),
      ...(query.activityTo ? { lte: new Date(`${query.activityTo}T23:59:59.999-03:00`) } : {}),
    };
    const games = await this.prisma.game.findMany({
      where: {
        teamId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to ? { date } : {}),
        ...(query.activityFrom || query.activityTo ? {
          transactions: { some: { teamId, reversedAt: null, createdAt: activityDate } },
        } : {}),
      },
      ...(query.compact ? {
        select: { id: true, date: true, opponent: true, location: true, status: true },
      } : {}),
      orderBy: { date: 'desc' },
    });
    if (query.compact) return games;
    return games.map((game) => this.normalize(game as Game));
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
      const dateChanged = data.date !== undefined &&
        new Date(data.date).getTime() !== current.date.getTime();
      const contributionChanged = data.expectedContributionPerDirector !== undefined &&
        Number(data.expectedContributionPerDirector) !== Number(current.expectedContributionPerDirector);
      const financialChange = dateChanged || contributionChanged;
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

  async correctFinancialValue(
    id: string,
    data: CorrectGameFinancialValueDto,
    teamId: string,
    actorId: string,
  ) {
    return this.reconciliation.runSerializable(async (tx) => {
      const current = await tx.game.findUnique({ where: { id_teamId: { id, teamId } } });
      if (!current) throw new NotFoundException(domainErrors.gameNotFound);

      const previousAmount = Number(current.expectedContributionPerDirector);
      const newAmount = data.expectedContributionPerDirector;
      const previousAmountInCents = Math.round(previousAmount * 100);
      const newAmountInCents = Math.round(newAmount * 100);
      if (previousAmountInCents === newAmountInCents) {
        throw new BadRequestException('O novo valor deve ser diferente do valor atual do jogo.');
      }

      const [transactions, obligations] = await Promise.all([
        tx.transaction.count({ where: { teamId, gameId: id } }),
        tx.collectionObligation.findMany({
          where: { teamId, gameId: id },
          select: {
            id: true,
            roleSnapshot: true,
            plan: { select: { frequency: true } },
            _count: { select: { allocations: true, adjustments: true } },
          },
        }),
      ]);
      const hasFinancialActivity = transactions > 0 || obligations.some(
        (item) => item._count.allocations > 0 || item._count.adjustments > 0,
      );
      if (!hasFinancialActivity) {
        throw new BadRequestException(
          'Este jogo ainda não possui movimentação financeira. Altere o valor pela edição normal.',
        );
      }

      const affectedObligations = obligations.filter(
        (item) => item.roleSnapshot === MemberRole.DIRECTOR &&
          item.plan.frequency === CollectionFrequency.PER_GAME,
      );
      const differenceInCents = newAmountInCents - previousAmountInCents;
      const adjustmentType = differenceInCents > 0 ? AdjustmentType.SURCHARGE : AdjustmentType.DISCOUNT;
      const adjustmentAmount = Math.abs(differenceInCents) / 100;
      const adjustmentReason = [
        `Correção do valor esperado do jogo de ${this.formatCurrency(previousAmount)}`,
        `para ${this.formatCurrency(newAmount)}.`,
        data.reason.trim(),
      ].join(' ');

      const updated = await tx.game.update({
        where: { id_teamId: { id, teamId } },
        data: { expectedContributionPerDirector: newAmount },
      });
      await tx.gameFinancialCorrection.create({
        data: {
          gameId: id,
          teamId,
          previousAmount,
          newAmount,
          reason: data.reason.trim(),
          createdByUserId: actorId,
        },
      });

      const day = updated.date.toISOString().slice(0, 10);
      const generation = await this.generation.generateInTransaction(tx, teamId, day, day);
      if (affectedObligations.length) {
        await tx.collectionAdjustment.createMany({
          data: affectedObligations.map((obligation) => ({
            obligationId: obligation.id,
            type: adjustmentType,
            amount: adjustmentAmount,
            reason: adjustmentReason,
            createdByUserId: actorId,
          })),
        });
        for (const obligation of affectedObligations) {
          await this.ledger.recalculateObligationInTransaction(tx, obligation.id);
        }
      }
      await this.ledger.applyAvailableCreditsInTransaction(tx, teamId);

      return {
        game: this.normalize(updated),
        correctedObligations: affectedObligations.length,
        generatedObligations: generation.created,
      };
    });
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

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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
