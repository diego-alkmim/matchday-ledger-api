import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AdjustmentType,
  CollectionPaymentStatus,
  ObligationStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATIC_CANCELLATION_REASON } from './collections.constants';
import { payableObligations, runSerializable } from './collections-transaction';
import { loadPaymentContext } from './collection-payment-context';
import { releaseActiveAllocationsForObligation, releaseExcessAllocations } from './collection-allocation-balance';
import { AdjustObligationDto, CreateCollectionPaymentDto } from './dto/collections.dto';

@Injectable()
export class CollectionsLedgerService {
  constructor(private prisma: PrismaService) {}
  async createPayment(dto: CreateCollectionPaymentDto, user: AccessTokenPayload) {
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const operation = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.collectionPayment.findUnique({
        where: { teamId_idempotencyKey: { teamId: user.teamId, idempotencyKey } },
        include: { transaction: true, allocations: { include: { obligation: true } } },
      });
      if (existing) return this.assertIdempotentPaymentMatches(existing, dto);
      const { member, plan, game } = await loadPaymentContext(tx, dto, user);
      const transaction = await tx.transaction.create({
        data: {
          teamId: user.teamId,
          type: TransactionType.ENTRADA,
          amount: dto.amount,
          date: new Date(dto.date),
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
          gameId: dto.gameId,
          categoryId: plan.categoryId,
          directorId: await this.resolveDirectorId(tx, user.teamId, member.id),
          createdByUserId: user.sub,
        },
      });
      const payment = await tx.collectionPayment.create({
        data: {
          teamId: user.teamId,
          memberId: member.id,
          planId: plan.id,
          transactionId: transaction.id,
          amount: dto.amount,
          availableAmount: dto.amount,
          idempotencyKey,
        },
      });
      await this.allocatePayment(
        tx,
        user.teamId,
        payment.id,
        member.id,
        plan.exclusiveGroup,
        dto.amount,
        dto.gameId,
        game?.date,
      );
      return tx.collectionPayment.findUnique({
        where: { id: payment.id },
        include: { transaction: true, allocations: { include: { obligation: true } } },
      });
    };
    try {
      return await runSerializable(this.prisma, operation, 'Falha ao registrar o pagamento.');
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.collectionPayment.findUnique({
        where: { teamId_idempotencyKey: { teamId: user.teamId, idempotencyKey } },
        include: { transaction: true, allocations: { include: { obligation: true } } },
      });
      if (!existing) throw error;
      return this.assertIdempotentPaymentMatches(existing, dto);
    }
  }
  async applyAvailableCredits(teamId: string) {
    return runSerializable(this.prisma, (tx) => this.applyAvailableCreditsInTransaction(tx, teamId), 'Falha ao aplicar os créditos disponíveis.');
  }

  async applyAvailableCreditsInTransaction(tx: Prisma.TransactionClient, teamId: string, memberId?: string) {
    const payments = await tx.collectionPayment.findMany({
      where: {
        teamId,
        ...(memberId ? { memberId } : {}),
        status: CollectionPaymentStatus.POSTED,
        availableAmount: { gt: 0 },
      },
      include: {
        transaction: { select: { gameId: true, game: { select: { date: true } } } },
        plan: { select: { exclusiveGroup: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const payment of payments) {
      await this.allocatePayment(
        tx,
        teamId,
        payment.id,
        payment.memberId,
        payment.plan.exclusiveGroup,
        payment.availableAmount.toNumber(),
        payment.transaction.gameId ?? undefined,
        payment.transaction.game?.date,
      );
    }
  }

  async restoreAutomaticallyCancelledObligationInTransaction(
    tx: Prisma.TransactionClient,
    obligationId: string,
    adjustmentId: string,
    actorId: string,
    reason: string,
  ) {
    await tx.collectionAdjustment.update({
      where: { id: adjustmentId },
      data: { reversedAt: new Date(), reversedByUserId: actorId, reversalReason: reason },
    });
    return this.recalculateObligation(tx, obligationId);
  }

  recalculateObligationInTransaction(tx: Prisma.TransactionClient, obligationId: string) {
    return this.recalculateObligation(tx, obligationId);
  }

  async reversePayment(id: string, reason: string, user: AccessTokenPayload) {
    return runSerializable(this.prisma, async (tx) => {
      const payment = await tx.collectionPayment.findUnique({
        where: { id_teamId: { id, teamId: user.teamId } },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundException('Pagamento não encontrado.');
      if (payment.status === CollectionPaymentStatus.REVERSED) {
        throw new BadRequestException('Pagamento já estornado.');
      }
      const now = new Date();
      await tx.collectionPayment.update({
        where: { id: payment.id },
        data: {
          status: CollectionPaymentStatus.REVERSED,
          availableAmount: 0,
          reversedAt: now,
          reversedByUserId: user.sub,
          reversalReason: reason,
        },
      });
      await tx.transaction.update({
        where: { id: payment.transactionId },
        data: { reversedAt: now, reversedByUserId: user.sub, reversalReason: reason },
      });
      for (const obligationId of new Set(payment.allocations.map((item) => item.obligationId))) {
        await this.recalculateObligation(tx, obligationId);
      }
      await this.applyAvailableCreditsInTransaction(tx, user.teamId, payment.memberId);
      return { reversed: true };
    }, 'Falha ao estornar o pagamento.');
  }

  async adjustObligation(id: string, dto: AdjustObligationDto, user: AccessTokenPayload) {
    if ((dto.type === AdjustmentType.DISCOUNT || dto.type === AdjustmentType.SURCHARGE) && !dto.amount) {
      throw new BadRequestException('Informe o valor do ajuste.');
    }
    const result = await runSerializable(this.prisma, async (tx) => {
      const obligation = await tx.collectionObligation.findUnique({
        where: { id },
        select: { id: true, teamId: true, memberId: true, status: true, _count: { select: { allocations: { where: { releasedAt: null } } } } },
      });
      if (!obligation || obligation.teamId !== user.teamId) throw new NotFoundException('Obrigação não encontrada.');
      if (obligation.status === ObligationStatus.CANCELLED || obligation.status === ObligationStatus.WAIVED) {
        throw new BadRequestException('Esta obrigação já está encerrada.');
      }
      if (dto.type === AdjustmentType.DISCOUNT && obligation._count.allocations > 0) {
        throw new BadRequestException('Aplique o desconto antes de registrar pagamentos nesta obrigação.');
      }
      await tx.collectionAdjustment.create({
        data: { obligationId: id, type: dto.type, amount: dto.amount ?? 0, reason: dto.reason, createdByUserId: user.sub },
      });
      if (dto.type === AdjustmentType.CANCELLATION || dto.type === AdjustmentType.WAIVER) {
        await this.releaseActiveAllocationsForObligationInTransaction(tx, id, dto.reason);
      }
      const result = await this.recalculateObligation(tx, id);
      await this.applyAvailableCreditsInTransaction(tx, user.teamId, obligation.memberId);
      return result;
    }, 'Falha ao ajustar a obrigação.');
    return result;
  }

  async reverseAdjustment(id: string, reason: string, user: AccessTokenPayload) {
    const result = await runSerializable(this.prisma, async (tx) => {
      const adjustment = await tx.collectionAdjustment.findUnique({
        where: { id },
        include: { obligation: { select: { id: true, teamId: true, memberId: true } } },
      });
      if (!adjustment || adjustment.obligation.teamId !== user.teamId) {
        throw new NotFoundException('Ajuste não encontrado.');
      }
      if (adjustment.reversedAt) throw new BadRequestException('Ajuste já estornado.');
      if (adjustment.type === AdjustmentType.CANCELLATION && adjustment.reason === AUTOMATIC_CANCELLATION_REASON) {
        throw new BadRequestException('Cancelamentos automáticos não podem ser desfeitos manualmente.');
      }
      await tx.collectionAdjustment.update({
        where: { id },
        data: {
          reversedAt: new Date(),
          reversedByUserId: user.sub,
          reversalReason: reason,
        },
      });
      const result = await this.recalculateObligation(tx, adjustment.obligation.id);
      await this.applyAvailableCreditsInTransaction(tx, user.teamId, adjustment.obligation.memberId);
      return result;
    }, 'Falha ao estornar o ajuste.');
    return result;
  }

  private async allocatePayment(
    tx: Prisma.TransactionClient,
    teamId: string,
    paymentId: string,
    memberId: string,
    exclusiveGroup: string,
    amount: number,
    ownGameId?: string,
    ownGameDate?: Date,
  ) {
    const availableObligations = await tx.collectionObligation.findMany({
      where: {
        teamId,
        memberId,
        plan: { exclusiveGroup },
        status: { in: [ObligationStatus.OPEN, ObligationStatus.PARTIAL] },
      },
      include: {
        allocations: {
          where: { paymentId, releasedAt: null },
          select: { id: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const obligations = payableObligations(availableObligations, ownGameId, ownGameDate);
    let remaining = new Prisma.Decimal(amount);
    let allocatedNow = new Prisma.Decimal(0);
    for (const obligation of obligations) {
      const missing = obligation.expectedAmount.minus(obligation.allocatedAmount);
      if (missing.lte(0) || remaining.lte(0)) continue;
      const applied = Prisma.Decimal.min(missing, remaining);
      const activeAllocation = obligation.allocations[0];
      if (activeAllocation) {
        await tx.collectionAllocation.update({
          where: { id: activeAllocation.id },
          data: { amount: { increment: applied } },
        });
      } else {
        await tx.collectionAllocation.upsert({
          where: { paymentId_obligationId: { paymentId, obligationId: obligation.id } },
          create: { paymentId, obligationId: obligation.id, amount: applied },
          update: { amount: applied, releasedAt: null, releaseReason: null },
        });
      }
      remaining = remaining.minus(applied);
      allocatedNow = allocatedNow.plus(applied);
      await this.recalculateObligation(tx, obligation.id);
    }
    if (allocatedNow.gt(0)) {
      await tx.collectionPayment.update({
        where: { id: paymentId },
        data: { availableAmount: { decrement: allocatedNow } },
      });
    }
  }

  async releaseActiveAllocationsForObligationInTransaction(
    tx: Prisma.TransactionClient,
    obligationId: string,
    reason: string,
  ) {
    return releaseActiveAllocationsForObligation(tx, obligationId, reason);
  }

  private async recalculateObligation(tx: Prisma.TransactionClient, id: string) {
    const obligation = await tx.collectionObligation.findUniqueOrThrow({
      where: { id },
      include: {
        adjustments: { where: { reversedAt: null } },
        allocations: {
          where: { releasedAt: null },
          include: { payment: { select: { id: true, status: true } } },
        },
      },
    });
    const terminal = obligation.adjustments.find((item) => item.type === AdjustmentType.CANCELLATION || item.type === AdjustmentType.WAIVER);
    const adjustment = obligation.adjustments.reduce((sum, item) => {
      if (item.type === AdjustmentType.DISCOUNT) return sum.minus(item.amount);
      if (item.type === AdjustmentType.SURCHARGE) return sum.plus(item.amount);
      return sum;
    }, new Prisma.Decimal(0));
    const expected = Prisma.Decimal.max(0, obligation.originalAmount.plus(adjustment));
    let allocated = obligation.allocations.reduce(
      (sum, item) => item.payment.status === CollectionPaymentStatus.POSTED ? sum.plus(item.amount) : sum,
      new Prisma.Decimal(0),
    );
    if (!terminal && allocated.gt(expected)) {
      await releaseExcessAllocations(tx, obligation.allocations, allocated.minus(expected));
      allocated = expected;
    }
    const status = terminal?.type === AdjustmentType.CANCELLATION
      ? ObligationStatus.CANCELLED
      : terminal?.type === AdjustmentType.WAIVER
        ? ObligationStatus.WAIVED
        : allocated.gte(expected) ? ObligationStatus.PAID : allocated.gt(0) ? ObligationStatus.PARTIAL : ObligationStatus.OPEN;
    return tx.collectionObligation.update({
      where: { id },
      data: { adjustmentAmount: adjustment, expectedAmount: terminal ? 0 : expected, allocatedAmount: terminal ? 0 : allocated, status },
    });
  }

  private async resolveDirectorId(tx: Prisma.TransactionClient, teamId: string, memberId: string) {
    const director = await tx.director.findFirst({ where: { teamId, memberId }, select: { id: true } });
    return director?.id ?? null;
  }

  private assertIdempotentPaymentMatches(
    payment: {
      memberId: string;
      planId: string;
      amount: Prisma.Decimal;
      transaction: { date: Date; gameId: string | null; paymentMethod: string; notes: string | null };
    },
    dto: CreateCollectionPaymentDto,
  ) {
    const sameRequest =
      payment.memberId === dto.memberId &&
      payment.planId === dto.planId &&
      payment.amount.equals(dto.amount) &&
      payment.transaction.date.getTime() === new Date(dto.date).getTime() &&
      payment.transaction.gameId === (dto.gameId ?? null) &&
      payment.transaction.paymentMethod === dto.paymentMethod &&
      payment.transaction.notes === (dto.notes ?? null);
    if (!sameRequest) throw new ConflictException('A chave de idempotência já foi usada em outro pagamento.');
    return payment;
  }
}
