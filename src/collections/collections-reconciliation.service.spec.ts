import {
  CollectionFrequency,
  MemberRole,
  ObligationStatus,
  ProrationPolicy,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { AUTOMATIC_CANCELLATION_REASON } from './collections.constants';

describe('CollectionsReconciliationService', () => {
  const planFindMany = jest.fn();
  const obligationFindMany = jest.fn();
  const adjustmentCreate = jest.fn();
  const allocationUpdateMany = jest.fn();
  const obligationUpdate = jest.fn();
  const tx = {
    collectionPlan: { findMany: planFindMany },
    collectionAdjustment: { create: adjustmentCreate },
    collectionAllocation: { updateMany: allocationUpdateMany },
    collectionObligation: { findMany: obligationFindMany, update: obligationUpdate },
  };
  const prisma = {
    collectionPlan: { findMany: planFindMany },
    collectionObligation: { findMany: obligationFindMany },
    $transaction: jest.fn((callback) => callback(tx)),
  } as unknown as PrismaService;
  const ledger = {
    applyAvailableCreditsInTransaction: jest.fn(),
    restoreAutomaticallyCancelledObligationInTransaction: jest.fn(),
  } as unknown as CollectionsLedgerService;
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
      adjustments: [],
      member: {
        roles: [{
          id: 'role-1', teamId: 'team-1', memberId: 'member-1', role: MemberRole.PLAYER,
          startsAt: new Date('2026-09-01'), endsAt: new Date('2026-09-10'), createdAt: new Date(),
        }],
      },
    }]);

    await expect(service.reconcile('team-1', 'user-1')).resolves.toEqual({ cancelled: 1, restored: 0 });

    expect(adjustmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ obligationId: 'obligation-1', createdByUserId: 'user-1' }),
    }));
    expect(obligationUpdate).toHaveBeenCalledWith({
      where: { id: 'obligation-1' },
      data: { status: ObligationStatus.CANCELLED, expectedAmount: 0, allocatedAmount: 0 },
    });
    expect(ledger.applyAvailableCreditsInTransaction).toHaveBeenCalledWith(tx, 'team-1');
  });

  it('restores an automatically cancelled obligation when the role becomes eligible again', async () => {
    const plan = {
      id: 'plan-1', teamId: 'team-1', name: 'Mensalidade', audienceRole: MemberRole.PLAYER,
      frequency: CollectionFrequency.MONTHLY, categoryId: 'category-1', priority: 50,
      exclusiveGroup: 'membership', dueDay: 20, prorationPolicy: ProrationPolicy.DUE_DATE_CUTOFF,
      effectiveFrom: new Date('2026-09-01'), inactiveAt: null, active: true,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const adjustment = { id: 'adjustment-1', type: 'CANCELLATION', reason: AUTOMATIC_CANCELLATION_REASON };
    planFindMany.mockResolvedValue([plan]);
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', competence: new Date('2026-09-01'), dueDate: new Date('2026-09-20'),
      status: ObligationStatus.CANCELLED, plan, adjustments: [adjustment],
      member: { roles: [{ role: MemberRole.PLAYER, startsAt: new Date('2026-09-01'), endsAt: null }] },
    }]);

    await expect(service.reconcile('team-1', 'user-1')).resolves.toEqual({ cancelled: 0, restored: 1 });

    expect(ledger.restoreAutomaticallyCancelledObligationInTransaction).toHaveBeenCalledWith(
      tx,
      'obligation-1',
      'adjustment-1',
      'user-1',
      expect.any(String),
    );
  });

  it('retries a serialization conflict', async () => {
    const conflict = Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    const operation = jest.fn().mockResolvedValue('ok');
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(conflict);

    await expect(service.runSerializable(operation)).resolves.toBe('ok');

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
