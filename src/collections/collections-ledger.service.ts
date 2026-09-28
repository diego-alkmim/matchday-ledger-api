import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdjustmentType,
  CollectionPaymentStatus,
  ObligationStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustObligationDto, CreateCollectionPaymentDto } from './dto/collections.dto';

@Injectable()
export class CollectionsLedgerService {
  constructor(private prisma: PrismaService) {}

  async createPayment(dto: CreateCollectionPaymentDto, user: AccessTokenPayload) {
    const [member, plan] = await Promise.all([
      this.prisma.member.findUnique({
        where: { id_teamId: { id: dto.memberId, teamId: user.teamId } },
        include: { roles: true },
      }),
      this.prisma.collectionPlan.findUnique({ where: { id_teamId: { id: dto.planId, teamId: user.teamId } } }),
    ]);
    if (!member || !plan) {
      throw new NotFoundException('Participante ou plano não encontrado.');
    }
    const paymentDate = new Date(dto.date);
    const hasRole = member.roles.some((role) =>
      role.role === plan.audienceRole && role.startsAt <= paymentDate && (!role.endsAt || role.endsAt >= paymentDate),
    );
    if (!hasRole || !plan.active || plan.effectiveFrom > paymentDate || (plan.inactiveAt && plan.inactiveAt < paymentDate)) {
      throw new BadRequestException('O plano não está vigente para este participante na data do pagamento.');
    }
    const activeRoles = member.roles
      .filter((role) => role.startsAt <= paymentDate && (!role.endsAt || role.endsAt >= paymentDate))
      .map((role) => role.role);
    const higherPriorityPlan = await this.prisma.collectionPlan.findFirst({
      where: {
        teamId: user.teamId,
        active: true,
        exclusiveGroup: plan.exclusiveGroup,
        audienceRole: { in: activeRoles },
        effectiveFrom: { lte: paymentDate },
        OR: [
          { inactiveAt: null, priority: { gt: plan.priority } },
          { inactiveAt: { gte: paymentDate }, priority: { gt: plan.priority } },
          { inactiveAt: null, priority: plan.priority, id: { lt: plan.id } },
          { inactiveAt: { gte: paymentDate }, priority: plan.priority, id: { lt: plan.id } },
        ],
      },
      select: { id: true },
    });
    if (higherPriorityPlan) {
      throw new BadRequestException('Outro plano tem prioridade para este participante na data informada.');
    }

    return this.prisma.$transaction(async (tx) => {
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
        },
      });
      await this.allocatePayment(tx, payment.id, member.id, dto.amount, dto.gameId);
      return tx.collectionPayment.findUnique({
        where: { id: payment.id },
        include: { transaction: true, allocations: { include: { obligation: true } } },
      });
    });
  }

  async applyAvailableCredits(teamId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payments = await tx.collectionPayment.findMany({
        where: { teamId, status: CollectionPaymentStatus.POSTED },
        include: {
          allocations: { where: { releasedAt: null } },
          transaction: { select: { gameId: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      for (const payment of payments) {
        const allocated = payment.allocations.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
        const remaining = payment.amount.minus(allocated);
        if (remaining.gt(0)) {
          await this.allocatePayment(
            tx,
            payment.id,
            payment.memberId,
            remaining.toNumber(),
            payment.transaction.gameId ?? undefined,
          );
        }
      }
    });
  }

  async reversePayment(id: string, reason: string, user: AccessTokenPayload) {
    return this.prisma.$transaction(async (tx) => {
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
        data: { status: CollectionPaymentStatus.REVERSED, reversedAt: now, reversedByUserId: user.sub, reversalReason: reason },
      });
      await tx.transaction.update({
        where: { id: payment.transactionId },
        data: { reversedAt: now, reversedByUserId: user.sub, reversalReason: reason },
      });
      for (const obligationId of new Set(payment.allocations.map((item) => item.obligationId))) {
        await this.recalculateObligation(tx, obligationId);
      }
      return { reversed: true };
    });
  }

  async adjustObligation(id: string, dto: AdjustObligationDto, user: AccessTokenPayload) {
    if ((dto.type === AdjustmentType.DISCOUNT || dto.type === AdjustmentType.SURCHARGE) && !dto.amount) {
      throw new BadRequestException('Informe o valor do ajuste.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const obligation = await tx.collectionObligation.findUnique({
        where: { id },
        select: { id: true, teamId: true, status: true, _count: { select: { allocations: { where: { releasedAt: null } } } } },
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
        await tx.collectionAllocation.updateMany({
          where: { obligationId: id, releasedAt: null },
          data: { releasedAt: new Date(), releaseReason: dto.reason },
        });
      }
      return this.recalculateObligation(tx, id);
    });
    await this.applyAvailableCredits(user.teamId);
    return result;
  }

  private async allocatePayment(tx: Prisma.TransactionClient, paymentId: string, memberId: string, amount: number, ownGameId?: string) {
    const obligations = await tx.collectionObligation.findMany({
      where: { memberId, status: { in: [ObligationStatus.OPEN, ObligationStatus.PARTIAL] } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    obligations.sort((a, b) => (a.gameId === ownGameId ? -1 : b.gameId === ownGameId ? 1 : a.dueDate.getTime() - b.dueDate.getTime()));
    let remaining = new Prisma.Decimal(amount);
    for (const obligation of obligations) {
      const missing = obligation.expectedAmount.minus(obligation.allocatedAmount);
      if (missing.lte(0) || remaining.lte(0)) continue;
      const applied = Prisma.Decimal.min(missing, remaining);
      await tx.collectionAllocation.create({ data: { paymentId, obligationId: obligation.id, amount: applied } });
      remaining = remaining.minus(applied);
      await this.recalculateObligation(tx, obligation.id);
    }
  }

  private async recalculateObligation(tx: Prisma.TransactionClient, id: string) {
    const obligation = await tx.collectionObligation.findUniqueOrThrow({
      where: { id },
      include: { adjustments: true, allocations: { where: { releasedAt: null }, include: { payment: { select: { status: true } } } } },
    });
    const terminal = obligation.adjustments.find((item) => item.type === AdjustmentType.CANCELLATION || item.type === AdjustmentType.WAIVER);
    const adjustment = obligation.adjustments.reduce((sum, item) => {
      if (item.type === AdjustmentType.DISCOUNT) return sum.minus(item.amount);
      if (item.type === AdjustmentType.SURCHARGE) return sum.plus(item.amount);
      return sum;
    }, new Prisma.Decimal(0));
    const expected = Prisma.Decimal.max(0, obligation.originalAmount.plus(adjustment));
    const allocated = obligation.allocations.reduce(
      (sum, item) => item.payment.status === CollectionPaymentStatus.POSTED ? sum.plus(item.amount) : sum,
      new Prisma.Decimal(0),
    );
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
}
