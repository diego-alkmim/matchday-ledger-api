import { Injectable } from '@nestjs/common';
import {
  AdjustmentType,
  CollectionFrequency,
  CollectionPlan,
  MemberRoleAssignment,
  ObligationStatus,
  ProrationPolicy,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import {
  AUTOMATIC_CANCELLATION_REASON,
  AUTOMATIC_CANCELLATION_RELEASE_REASON,
  AUTOMATIC_RESTORATION_REASON,
} from './collections.constants';
import { runSerializable } from './collections-transaction';

@Injectable()
export class CollectionsReconciliationService {
  constructor(
    private prisma: PrismaService,
    private ledger: CollectionsLedgerService,
  ) {}

  async reconcile(teamId: string, actorId: string, memberId?: string) {
    return this.runSerializable((tx) => this.reconcileInTransaction(tx, teamId, actorId, memberId));
  }

  async runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return runSerializable(this.prisma, operation, 'Falha ao reconciliar as obrigações financeiras.');
  }

  async reconcileInTransaction(
    tx: Prisma.TransactionClient,
    teamId: string,
    actorId: string,
    memberId?: string,
  ) {
    const [plans, obligations] = await Promise.all([
      tx.collectionPlan.findMany({ where: { teamId } }),
      tx.collectionObligation.findMany({
        where: {
          teamId,
          ...(memberId ? { memberId } : {}),
          status: { in: [ObligationStatus.OPEN, ObligationStatus.PARTIAL, ObligationStatus.PAID, ObligationStatus.CANCELLED] },
        },
        include: {
          plan: true,
          member: { include: { roles: true } },
          adjustments: { where: { reversedAt: null }, orderBy: { createdAt: 'desc' } },
        },
      }),
    ]);

    const evaluated = obligations.map((obligation) => {
      const referenceDate = this.referenceDate(obligation.plan, obligation.competence, obligation.dueDate);
      return { obligation, eligible: this.planWinsAt(obligation.plan, plans, obligation.member.roles, referenceDate) };
    });
    const ineligible = evaluated
      .filter(({ obligation, eligible }) => !eligible && obligation.status !== ObligationStatus.CANCELLED)
      .map(({ obligation }) => obligation);
    const restorable = evaluated.flatMap(({ obligation, eligible }) => {
      if (!eligible || obligation.status !== ObligationStatus.CANCELLED) return [];
      const adjustment = obligation.adjustments.find((item) =>
        item.type === AdjustmentType.CANCELLATION && item.reason === AUTOMATIC_CANCELLATION_REASON,
      );
      return adjustment ? [{ obligation, adjustment }] : [];
    });

    if (ineligible.length) {
      for (const obligation of ineligible) {
        await tx.collectionAdjustment.create({
          data: {
            obligationId: obligation.id,
            type: AdjustmentType.CANCELLATION,
            amount: 0,
            reason: AUTOMATIC_CANCELLATION_REASON,
            createdByUserId: actorId,
          },
        });
        await this.ledger.releaseActiveAllocationsForObligationInTransaction(
          tx,
          obligation.id,
          AUTOMATIC_CANCELLATION_RELEASE_REASON,
        );
        await tx.collectionObligation.update({
          where: { id: obligation.id },
          data: { status: ObligationStatus.CANCELLED, expectedAmount: 0, allocatedAmount: 0 },
        });
      }
    }

    for (const { obligation, adjustment } of restorable) {
      await this.ledger.restoreAutomaticallyCancelledObligationInTransaction(
        tx,
        obligation.id,
        adjustment.id,
        actorId,
        AUTOMATIC_RESTORATION_REASON,
      );
    }

    await this.ledger.applyAvailableCreditsInTransaction(tx, teamId);
    return { cancelled: ineligible.length, restored: restorable.length };
  }

  private referenceDate(plan: CollectionPlan, competence: Date | null, dueDate: Date) {
    if (plan.frequency === CollectionFrequency.PER_GAME || !competence) return dueDate;
    if (plan.prorationPolicy === ProrationPolicy.FULL_AMOUNT) {
      return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth() + 1, 0));
    }
    if (plan.prorationPolicy === ProrationPolicy.NEXT_MONTH) {
      return new Date(competence.getTime() - 1);
    }
    return dueDate;
  }

  private planWinsAt(
    plan: CollectionPlan,
    plans: CollectionPlan[],
    roles: MemberRoleAssignment[],
    date: Date,
  ) {
    if (!this.planActive(plan, date) || !this.hasRole(roles, plan.audienceRole, date)) return false;
    return !plans.some((candidate) =>
      candidate.id !== plan.id &&
      candidate.exclusiveGroup === plan.exclusiveGroup &&
      (candidate.priority > plan.priority ||
        (candidate.priority === plan.priority && candidate.id < plan.id)) &&
      this.planActive(candidate, date) &&
      this.hasRole(roles, candidate.audienceRole, date),
    );
  }

  private planActive(plan: CollectionPlan, date: Date) {
    return plan.effectiveFrom <= date && (!plan.inactiveAt || plan.inactiveAt >= date);
  }

  private hasRole(
    roles: MemberRoleAssignment[],
    role: MemberRoleAssignment['role'],
    date: Date,
  ) {
    return roles.some((assignment) =>
      assignment.role === role &&
      assignment.startsAt <= date &&
      (!assignment.endsAt || assignment.endsAt >= date),
    );
  }
}
