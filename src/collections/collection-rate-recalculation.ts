import {
  CollectionFrequency,
  CollectionPlan,
  CollectionPlanRate,
  MemberRole,
  ObligationStatus,
  Prisma,
  ProrationPolicy,
} from '@prisma/client';

type PlanWithRates = CollectionPlan & { rates: CollectionPlanRate[] };

export async function refreshUntouchedObligationsForRate(
  tx: Prisma.TransactionClient,
  teamId: string,
  plan: PlanWithRates,
  rate: CollectionPlanRate,
) {
  if (plan.frequency === CollectionFrequency.PER_GAME && plan.audienceRole === MemberRole.DIRECTOR) return;
  const obligations = await tx.collectionObligation.findMany({
    where: { teamId, planId: plan.id },
    select: {
      id: true, competence: true, dueDate: true,
      _count: { select: { allocations: true, adjustments: true } },
    },
  });
  const rates = [...plan.rates, rate].sort(
    (first, second) => first.effectiveFrom.getTime() - second.effectiveFrom.getTime(),
  );
  for (const obligation of obligations) {
    if (obligation._count.allocations > 0 || obligation._count.adjustments > 0) continue;
    const referenceDate = rateReferenceDate(
      plan.frequency,
      plan.prorationPolicy,
      obligation.competence,
      obligation.dueDate,
    );
    const applicableRate = [...rates].reverse().find((item) => item.effectiveFrom <= referenceDate);
    if (!applicableRate) continue;
    await tx.collectionObligation.update({
      where: { id: obligation.id },
      data: {
        originalAmount: applicableRate.amount,
        expectedAmount: applicableRate.amount,
        adjustmentAmount: 0,
        allocatedAmount: 0,
        status: ObligationStatus.OPEN,
      },
    });
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
