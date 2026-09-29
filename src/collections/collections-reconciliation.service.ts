import { Injectable } from '@nestjs/common';
import {
  AdjustmentType,
  CollectionFrequency,
  CollectionPlan,
  MemberRoleAssignment,
  ObligationStatus,
  ProrationPolicy,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsLedgerService } from './collections-ledger.service';

@Injectable()
export class CollectionsReconciliationService {
  constructor(
    private prisma: PrismaService,
    private ledger: CollectionsLedgerService,
  ) {}

  async reconcile(teamId: string, actorId: string) {
    const [plans, obligations] = await Promise.all([
      this.prisma.collectionPlan.findMany({ where: { teamId } }),
      this.prisma.collectionObligation.findMany({
        where: {
          teamId,
          status: { in: [ObligationStatus.OPEN, ObligationStatus.PARTIAL, ObligationStatus.PAID] },
        },
        include: { plan: true, member: { include: { roles: true } } },
      }),
    ]);

    const ineligible = obligations.filter((obligation) => {
      const referenceDate = this.referenceDate(obligation.plan, obligation.competence, obligation.dueDate);
      return !this.planWinsAt(obligation.plan, plans, obligation.member.roles, referenceDate);
    });

    if (!ineligible.length) return { cancelled: 0 };

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const obligation of ineligible) {
        await tx.collectionAdjustment.create({
          data: {
            obligationId: obligation.id,
            type: AdjustmentType.CANCELLATION,
            amount: 0,
            reason: 'Cancelamento automático por alteração de vigência ou função.',
            createdByUserId: actorId,
          },
        });
        await tx.collectionAllocation.updateMany({
          where: { obligationId: obligation.id, releasedAt: null },
          data: { releasedAt: now, releaseReason: 'Obrigação cancelada automaticamente.' },
        });
        await tx.collectionObligation.update({
          where: { id: obligation.id },
          data: { status: ObligationStatus.CANCELLED, expectedAmount: 0, allocatedAmount: 0 },
        });
      }
    });

    await this.ledger.applyAvailableCredits(teamId);
    return { cancelled: ineligible.length };
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
