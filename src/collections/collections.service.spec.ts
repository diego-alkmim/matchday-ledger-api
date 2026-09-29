import { CollectionFrequency, MemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsService } from './collections.service';

describe('CollectionsService effective periods', () => {
  const memberFindUnique = jest.fn();
  const roleFindFirst = jest.fn();
  const roleCreate = jest.fn();
  const roleUpdate = jest.fn();
  const planFindUnique = jest.fn();
  const rateCreate = jest.fn();
  const tx = {
    member: { findUnique: memberFindUnique },
    memberRoleAssignment: { findFirst: roleFindFirst, create: roleCreate, update: roleUpdate },
  };
  const prisma = {
    collectionPlan: { findUnique: planFindUnique },
    collectionPlanRate: { create: rateCreate },
  } as unknown as PrismaService;
  const reconciliation = {
    runSerializable: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    reconcileInTransaction: jest.fn(),
  } as unknown as CollectionsReconciliationService;
  const service = new CollectionsService(prisma, reconciliation);

  beforeEach(() => jest.clearAllMocks());

  it('rejects an overlapping role period', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'), director: null,
      roles: [{ role: MemberRole.PLAYER, startsAt: new Date('2026-02-01'), endsAt: new Date('2026-08-31') }],
    });

    await expect(service.addMemberRole(
      'team-1', 'member-1', MemberRole.PLAYER, '2026-08-01', 'user-1',
    )).rejects.toThrow('Já existe um período igual ou sobreposto para esta função.');

    expect(roleCreate).not.toHaveBeenCalled();
  });

  it('rejects a role end before its start', async () => {
    roleFindFirst.mockResolvedValue({ id: 'role-1', startsAt: new Date('2026-09-10') });

    await expect(service.endMemberRole(
      'team-1', 'member-1', MemberRole.PLAYER, '2026-09-01', 'user-1',
    )).rejects.toThrow('A função não pode terminar antes de seu início.');

    expect(roleUpdate).not.toHaveBeenCalled();
  });

  it('rejects a rate before the plan effective date', async () => {
    planFindUnique.mockResolvedValue({
      id: 'plan-1', frequency: CollectionFrequency.MONTHLY, effectiveFrom: new Date('2026-09-01'),
    });

    await expect(service.addRate('team-1', 'plan-1', {
      amount: 70, effectiveFrom: '2026-08-01',
    })).rejects.toThrow('A vigência da tarifa não pode ser anterior ao início do plano.');

    expect(rateCreate).not.toHaveBeenCalled();
  });
});
