import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsService } from './collections.service';

describe('CollectionsService summary', () => {
  const obligationFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const paymentAggregate = jest.fn();
  const prisma = {
    collectionObligation: { findMany: obligationFindMany },
    collectionPayment: { findMany: paymentFindMany, aggregate: paymentAggregate },
  } as unknown as PrismaService;
  const service = new CollectionsService(
    prisma,
    {} as CollectionsReconciliationService,
    {} as CollectionsGenerationService,
    {} as CollectionsLedgerService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    obligationFindMany.mockResolvedValue([]);
    paymentFindMany.mockResolvedValue([]);
    paymentAggregate.mockResolvedValue({
      _sum: { availableAmount: new Prisma.Decimal(45) },
    });
  });

  it('reads available credit with one aggregate instead of loading payment history', async () => {
    const result = await service.summary('team-1', '2026-09-01', '2026-09-30');

    expect(result.totals.credit).toBe(45);
    expect(paymentAggregate).toHaveBeenCalledWith({
      where: { teamId: 'team-1', status: 'POSTED' },
      _sum: { availableAmount: true },
    });
    expect(paymentFindMany).toHaveBeenCalledTimes(1);
    expect(paymentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ availableAmount: true }),
    }));
    const paymentQuery = paymentFindMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(paymentQuery.select).not.toHaveProperty('allocations');
  });

  it('rejects periods longer than one year before querying the database', async () => {
    await expect(service.summary(
      'team-1', '2025-01-01', '2026-01-02',
    )).rejects.toThrow('O período deve ter no máximo 366 dias');

    expect(obligationFindMany).not.toHaveBeenCalled();
    expect(paymentFindMany).not.toHaveBeenCalled();
    expect(paymentAggregate).not.toHaveBeenCalled();
  });

  it('requires both period boundaries when one is provided', async () => {
    await expect(service.summary('team-1', '2026-09-01')).rejects.toThrow(
      'Informe as datas inicial e final do per\u00edodo.',
    );

    expect(obligationFindMany).not.toHaveBeenCalled();
  });
});
