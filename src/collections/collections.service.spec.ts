import { CollectionFrequency, MemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsService } from './collections.service';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';

describe('CollectionsService effective periods', () => {
  const memberFindUnique = jest.fn();
  const memberUpdate = jest.fn();
  const roleFindFirst = jest.fn();
  const roleCreate = jest.fn();
  const roleUpdate = jest.fn();
  const roleCount = jest.fn();
  const directorUpdateMany = jest.fn();
  const planFindUnique = jest.fn();
  const rateCreate = jest.fn();
  const tx = {
    member: { findUnique: memberFindUnique, update: memberUpdate },
    memberRoleAssignment: { findFirst: roleFindFirst, create: roleCreate, update: roleUpdate, count: roleCount },
    director: { updateMany: directorUpdateMany },
  };
  const prisma = {
    collectionPlan: { findUnique: planFindUnique },
    collectionPlanRate: { create: rateCreate },
  } as unknown as PrismaService;
  const reconciliation = {
    runSerializable: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    reconcileInTransaction: jest.fn(),
  } as unknown as CollectionsReconciliationService;
  const generation = { generateInTransaction: jest.fn() } as unknown as CollectionsGenerationService;
  const ledger = { applyAvailableCreditsInTransaction: jest.fn() } as unknown as CollectionsLedgerService;
  const service = new CollectionsService(prisma, reconciliation, generation, ledger);

  beforeEach(() => jest.clearAllMocks());

  it('generates obligations immediately after adding an effective role', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'), director: null, roles: [],
    });
    roleCreate.mockResolvedValue({ id: 'role-1' });

    await service.addMemberRole('team-1', 'member-1', MemberRole.PLAYER, '2026-09-01', 'user-1');

    expect(generation.generateInTransaction).toHaveBeenCalledWith(
      tx,
      'team-1',
      '2026-09-01',
      expect.any(String),
    );
    expect(ledger.applyAvailableCreditsInTransaction).toHaveBeenCalledWith(tx, 'team-1');
  });

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

  it('allows correcting a role that already has a future end date', async () => {
    roleFindFirst.mockResolvedValue({
      id: 'role-1', startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-31'),
    });
    roleUpdate.mockResolvedValue({ id: 'role-1', endsAt: new Date('2026-10-31') });
    roleCount.mockResolvedValue(1);

    await service.endMemberRole(
      'team-1', 'member-1', MemberRole.DIRECTOR, '2026-10-31', 'user-1',
    );

    expect(roleUpdate).toHaveBeenCalledWith({
      where: { id: 'role-1' }, data: { endsAt: new Date('2026-10-31') },
    });
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
