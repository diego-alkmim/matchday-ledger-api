import { CollectionFrequency, MemberRole, ProrationPolicy, Prisma } from '@prisma/client';
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
  const roleDelete = jest.fn();
  const roleUpdateMany = jest.fn();
  const roleDeleteMany = jest.fn();
  const roleCount = jest.fn();
  const directorUpdateMany = jest.fn();
  const planFindUnique = jest.fn();
  const rateCreate = jest.fn();
  const obligationFindMany = jest.fn();
  const obligationUpdate = jest.fn();
  const tx = {
    member: { findUnique: memberFindUnique, update: memberUpdate },
    memberRoleAssignment: {
      findFirst: roleFindFirst, create: roleCreate, update: roleUpdate, delete: roleDelete,
      updateMany: roleUpdateMany, deleteMany: roleDeleteMany, count: roleCount,
    },
    director: { updateMany: directorUpdateMany },
    collectionPlan: { findUnique: planFindUnique },
    collectionPlanRate: { create: rateCreate },
    collectionObligation: { findMany: obligationFindMany, update: obligationUpdate },
  };
  const prisma = {} as PrismaService;
  const reconciliation = {
    runSerializable: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    reconcileInTransaction: jest.fn(),
  } as unknown as CollectionsReconciliationService;
  const generation = { generateInTransaction: jest.fn() } as unknown as CollectionsGenerationService;
  const ledger = {
    applyAvailableCreditsInTransaction: jest.fn(),
    recalculateObligationInTransaction: jest.fn(),
  } as unknown as CollectionsLedgerService;
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

  it('cancels a scheduled role when the end date is before its start', async () => {
    roleFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'role-1', startsAt: new Date('2026-10-10') });
    roleCount.mockResolvedValue(0);

    await service.endMemberRole(
      'team-1', 'member-1', MemberRole.PLAYER, '2026-09-01', 'user-1',
    );

    expect(roleUpdate).not.toHaveBeenCalled();
    expect(roleDelete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
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

  it('shortens finite roles and removes future roles when deactivating a member', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'),
      roles: [
        { startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-31') },
        { startsAt: new Date('2027-01-01'), endsAt: null },
      ],
    });

    await service.deactivateMember('team-1', 'member-1', '2026-09-30', 'user-1');

    expect(roleUpdateMany).toHaveBeenCalledWith({
      where: {
        teamId: 'team-1', memberId: 'member-1', startsAt: { lte: new Date('2026-09-30') },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date('2026-09-30') } }],
      },
      data: { endsAt: new Date('2026-09-30') },
    });
    expect(roleDeleteMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1', memberId: 'member-1', startsAt: { gt: new Date('2026-09-30') } },
    });
  });

  it('updates untouched obligations when a new rate becomes effective', async () => {
    planFindUnique.mockResolvedValue({
      id: 'plan-1', teamId: 'team-1', audienceRole: MemberRole.PLAYER,
      frequency: CollectionFrequency.MONTHLY, prorationPolicy: ProrationPolicy.DUE_DATE_CUTOFF,
      effectiveFrom: new Date('2026-01-01'),
      rates: [{ id: 'old', amount: new Prisma.Decimal(50), effectiveFrom: new Date('2026-01-01') }],
    });
    rateCreate.mockResolvedValue({
      id: 'new', amount: new Prisma.Decimal(70), effectiveFrom: new Date('2026-09-01'),
    });
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', competence: new Date('2026-09-01'), dueDate: new Date('2026-09-20'),
      originalAmount: new Prisma.Decimal(50),
    }]);

    await service.addRate('team-1', 'plan-1', { amount: 70, effectiveFrom: '2026-09-01' });

    expect(obligationUpdate).toHaveBeenCalledWith({
      where: { id: 'obligation-1' },
      data: { originalAmount: new Prisma.Decimal(70) },
    });
    expect(ledger.recalculateObligationInTransaction).toHaveBeenCalledWith(tx, 'obligation-1');
    expect(ledger.applyAvailableCreditsInTransaction).toHaveBeenCalledWith(tx, 'team-1');
  });

  it('recalculates prepaid obligations when a new rate becomes effective', async () => {
    planFindUnique.mockResolvedValue({
      id: 'plan-1', teamId: 'team-1', audienceRole: MemberRole.PLAYER,
      frequency: CollectionFrequency.MONTHLY, prorationPolicy: ProrationPolicy.DUE_DATE_CUTOFF,
      effectiveFrom: new Date('2026-01-01'), rates: [],
    });
    rateCreate.mockResolvedValue({
      id: 'new', amount: new Prisma.Decimal(70), effectiveFrom: new Date('2026-09-01'),
    });
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', competence: new Date('2026-09-01'), dueDate: new Date('2026-09-20'),
      originalAmount: new Prisma.Decimal(50),
    }]);

    await service.addRate('team-1', 'plan-1', { amount: 70, effectiveFrom: '2026-09-01' });

    expect(obligationUpdate).toHaveBeenCalledWith({
      where: { id: 'obligation-1' }, data: { originalAmount: new Prisma.Decimal(70) },
    });
    expect(ledger.recalculateObligationInTransaction).toHaveBeenCalledWith(tx, 'obligation-1');
  });

  it('targets a future role by assignment id even when a current role exists', async () => {
    roleFindFirst.mockResolvedValue({ id: 'future-role', startsAt: new Date('2026-10-10') });
    roleCount.mockResolvedValue(1);

    await service.endMemberRole(
      'team-1', 'member-1', MemberRole.PLAYER, '2026-09-29', 'user-1', 'future-role',
    );

    expect(roleFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'future-role', teamId: 'team-1', memberId: 'member-1', role: MemberRole.PLAYER,
      },
    });
    expect(roleDelete).toHaveBeenCalledWith({ where: { id: 'future-role' } });
    expect(roleUpdate).not.toHaveBeenCalled();
  });
});
