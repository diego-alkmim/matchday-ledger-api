import { CollectionPaymentStatus, Prisma } from '@prisma/client';

export async function releaseActiveAllocationsForObligation(
  tx: Prisma.TransactionClient,
  obligationId: string,
  reason: string,
) {
  const allocations = await tx.collectionAllocation.findMany({
    where: { obligationId, releasedAt: null },
    select: {
      paymentId: true,
      amount: true,
      payment: { select: { status: true } },
    },
  });
  if (!allocations.length) return;
  await tx.collectionAllocation.updateMany({
    where: { obligationId, releasedAt: null },
    data: { releasedAt: new Date(), releaseReason: reason },
  });
  const releasedByPayment = new Map<string, Prisma.Decimal>();
  for (const allocation of allocations) {
    if (allocation.payment.status !== CollectionPaymentStatus.POSTED) continue;
    releasedByPayment.set(
      allocation.paymentId,
      (releasedByPayment.get(allocation.paymentId) ?? new Prisma.Decimal(0)).plus(allocation.amount),
    );
  }
  for (const [paymentId, released] of releasedByPayment) {
    await tx.collectionPayment.update({
      where: { id: paymentId },
      data: { availableAmount: { increment: released } },
    });
  }
}

export async function releaseExcessAllocations(
  tx: Prisma.TransactionClient,
  allocations: Array<{
    id: string;
    amount: Prisma.Decimal;
    createdAt: Date;
    payment: { id: string; status: CollectionPaymentStatus };
  }>,
  excessInput: Prisma.Decimal,
) {
  let excess = excessInput;
  const posted = allocations
    .filter((item) => item.payment.status === CollectionPaymentStatus.POSTED)
    .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
  for (const allocation of posted) {
    if (excess.lte(0)) break;
    const released = Prisma.Decimal.min(allocation.amount, excess);
    if (allocation.amount.lte(excess)) {
      await tx.collectionAllocation.update({
        where: { id: allocation.id },
        data: {
          releasedAt: new Date(),
          releaseReason: 'Excedente liberado após recálculo da obrigação.',
        },
      });
    } else {
      await tx.collectionAllocation.update({
        where: { id: allocation.id },
        data: { amount: allocation.amount.minus(released) },
      });
    }
    await tx.collectionPayment.update({
      where: { id: allocation.payment.id },
      data: { availableAmount: { increment: released } },
    });
    excess = excess.minus(released);
  }
}
