import {
  CollectionFrequency,
  CollectionPaymentStatus,
  ObligationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsDirectorReportService } from './collections-director-report.service';

describe('CollectionsDirectorReportService', () => {
  const planFindMany = jest.fn();
  const obligationFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const prisma = {
    collectionPlan: { findMany: planFindMany },
    collectionObligation: { findMany: obligationFindMany },
    collectionPayment: { findMany: paymentFindMany },
  } as unknown as PrismaService;
  const service = new CollectionsDirectorReportService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('uses monthly collection obligations and payments without requiring a game', async () => {
    planFindMany.mockResolvedValue([{
      id: 'plan-1', frequency: CollectionFrequency.MONTHLY, exclusiveGroup: 'membership',
    }]);
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', memberId: 'member-1', gameId: null,
      competence: new Date('2026-09-01'), dueDate: new Date('2026-09-20'),
      expectedAmount: new Prisma.Decimal(100), status: ObligationStatus.PAID,
      member: { id: 'member-1', name: 'Diretor', contact: null }, game: null,
      allocations: [{ amount: new Prisma.Decimal(100) }],
    }]);
    paymentFindMany.mockResolvedValue([{
      memberId: 'member-1', amount: new Prisma.Decimal(100), status: CollectionPaymentStatus.POSTED,
    }]);

    const result = await service.build('team-1', '2026-09-01', '2026-09-30');

    expect(result?.summary.mode).toBe('MONTHLY');
    expect(result?.directors[0]).toMatchObject({
      status: 'EM_DIA',
      totals: { expectedTotal: 100, totalPaid: 100, delta: 0 },
      missingObligations: [],
    });
    expect(paymentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plan: { exclusiveGroup: { in: ['membership'] } },
      }),
    }));
  });
});
