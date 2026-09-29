import {
  CollectionFrequency,
  CollectionPlan,
  CollectionPlanRate,
  MemberRole,
  Prisma,
  ProrationPolicy,
} from '@prisma/client';
import { CollectionsLedgerService } from './collections-ledger.service';

type PlanWithRates = CollectionPlan & { rates: CollectionPlanRate[] };

export async function refreshUntouchedObligationsForRate(
  tx: Prisma.TransactionClient,
  teamId: string,
  plan: PlanWithRates,
  rate: CollectionPlanRate,
  ledger: CollectionsLedgerService,
) {
  if (plan.frequency === CollectionFrequency.PER_GAME && plan.audienceRole === MemberRole.DIRECTOR) return;
  const obligations = await tx.collectionObligation.findMany({
    where: { teamId, planId: plan.id },
    select: {
      id: true, competence: true, dueDate: true, originalAmount: true,
    },
  });
  const rates = [...plan.rates, rate].sort(
    (first, second) => first.effectiveFrom.getTime() - second.effectiveFrom.getTime(),
  );
  for (const obligation of obligations) {
    const referenceDate = rateReferenceDate(
      plan.frequency,
      plan.prorationPolicy,
      obligation.competence,
      obligation.dueDate,
    );
    const applicableRate = [...rates].reverse().find((item) => item.effectiveFrom <= referenceDate);
    if (!applicableRate || obligation.originalAmount.equals(applicableRate.amount)) continue;
    await tx.collectionObligation.update({
      where: { id: obligation.id },
      data: { originalAmount: applicableRate.amount },
    });
    await ledger.recalculateObligationInTransaction(tx, obligation.id);
  }
}

function rateReferenceDate(
  frequency: CollectionFrequency,
  prorationPolicy: ProrationPolicy,
  competence: Date | null,
  dueDate: Date,
) {
  if (frequency === CollectionFrequency.PER_GAME || !competence) return dueDate;
  if (prorationPolicy === ProrationPolicy.FULL_AMOUNT) {
    return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth() + 1, 0));
  }
  if (prorationPolicy === ProrationPolicy.NEXT_MONTH) return new Date(competence.getTime() - 1);
  return dueDate;
}
