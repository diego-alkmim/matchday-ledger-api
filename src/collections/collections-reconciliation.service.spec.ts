import {
  CollectionFrequency,
  MemberRole,
  ObligationStatus,
  ProrationPolicy,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';

describe('CollectionsReconciliationService', () => {
  const planFindMany = jest.fn();
  const obligationFindMany = jest.fn();
  const adjustmentCreate = jest.fn();
  const allocationUpdateMany = jest.fn();
  const obligationUpdate = jest.fn();
  const tx = {
    collectionAdjustment: { create: adjustmentCreate },
    collectionAllocation: { updateMany: allocationUpdateMany },
    collectionObligation: { update: obligationUpdate },
  };
  const prisma = {
    collectionPlan: { findMany: planFindMany },
    collectionObligation: { findMany: obligationFindMany },
    $transaction: jest.fn((callback) => callback(tx)),
  } as unknown as PrismaService;
  const ledger = { applyAvailableCredits: jest.fn() } as unknown as CollectionsLedgerService;
  const service = new CollectionsReconciliationService(prisma, ledger);

  beforeEach(() => jest.clearAllMocks());

  it('cancels an obligation that became ineligible after a role end', async () => {
    const plan = {
      id: 'plan-1', teamId: 'team-1', name: 'Mensalidade', audienceRole: MemberRole.PLAYER,
      frequency: CollectionFrequency.MONTHLY, categoryId: 'category-1', priority: 50,
      exclusiveGroup: 'membership', dueDay: 20, prorationPolicy: ProrationPolicy.DUE_DATE_CUTOFF,
      effectiveFrom: new Date('2026-09-01'), inactiveAt: null, active: true,
      createdAt: new Date(), updatedAt: new Date(),
    };
    planFindMany.mockResolvedValue([plan]);
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', competence: new Date('2026-09-01'), dueDate: new Date('2026-09-20'),
      status: ObligationStatus.OPEN, plan,
      member: {
        roles: [{
          id: 'role-1', teamId: 'team-1', memberId: 'member-1', role: MemberRole.PLAYER,
          startsAt: new Date('2026-09-01'), endsAt: new Date('2026-09-10'), createdAt: new Date(),
        }],
      },
    }]);

    await expect(service.reconcile('team-1', 'user-1')).resolves.toEqual({ cancelled: 1 });

    expect(adjustmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ obligationId: 'obligation-1', createdByUserId: 'user-1' }),
    }));
    expect(obligationUpdate).toHaveBeenCalledWith({
      where: { id: 'obligation-1' },
      data: { status: ObligationStatus.CANCELLED, expectedAmount: 0, allocatedAmount: 0 },
    });
    expect(ledger.applyAvailableCredits).toHaveBeenCalledWith('team-1');
  });
});
