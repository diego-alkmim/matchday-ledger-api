import { PrismaService } from '../prisma/prisma.service';
import { CollectionsReconciliationService } from '../collections/collections-reconciliation.service';
import { DirectorsService } from './directors.service';
import { CollectionsGenerationService } from '../collections/collections-generation.service';
import { CollectionsLedgerService } from '../collections/collections-ledger.service';

describe('DirectorsService collection role lifecycle', () => {
  const directorFindUnique = jest.fn();
  const directorUpdate = jest.fn();
  const roleFindFirst = jest.fn();
  const roleUpdate = jest.fn();
  const roleCreate = jest.fn();
  const roleDeleteMany = jest.fn();
  const roleCount = jest.fn();
  const memberUpdate = jest.fn();
  const tx = {
    director: { update: directorUpdate },
    memberRoleAssignment: {
      findFirst: roleFindFirst,
      update: roleUpdate,
      create: roleCreate,
      deleteMany: roleDeleteMany,
      count: roleCount,
    },
    member: { update: memberUpdate },
  };
  const prisma = {
    director: { findUnique: directorFindUnique },
  } as unknown as PrismaService;
  const reconciliation = {
    runSerializable: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    reconcileInTransaction: jest.fn(),
  } as unknown as CollectionsReconciliationService;
  const generation = {
    generateInTransaction: jest.fn().mockResolvedValue({ created: 1 }),
  } as unknown as CollectionsGenerationService;
  const ledger = {
    applyAvailableCreditsInTransaction: jest.fn(),
  } as unknown as CollectionsLedgerService;
  const service = new DirectorsService(prisma, reconciliation, generation, ledger);

  beforeEach(() => jest.clearAllMocks());

  it('shortens a scheduled director role when the director is deactivated now', async () => {
    const futureEnd = new Date('2026-12-31');
    directorFindUnique.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: false });
    directorUpdate.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: false });
    roleFindFirst
      .mockResolvedValueOnce({ id: 'role-1', startsAt: new Date('2026-01-01'), endsAt: futureEnd })
      .mockResolvedValueOnce({ endsAt: new Date('2000-01-01') });
    roleCount.mockResolvedValue(0);

    await service.remove('director-1', 'team-1', 'user-1');

    expect(roleUpdate).toHaveBeenCalledWith({
      where: { id: 'role-1' },
      data: { endsAt: expect.any(Date) },
    });
    expect(roleDeleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ teamId: 'team-1', memberId: 'member-1' }),
    });
    expect(reconciliation.reconcileInTransaction).toHaveBeenCalledWith(
      tx, 'team-1', 'user-1', 'member-1',
    );
  });

  it('generates current obligations when a director is reactivated', async () => {
    directorFindUnique.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: false });
    directorUpdate.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: true });
    roleFindFirst.mockResolvedValue(null);
    roleCreate.mockResolvedValue({ id: 'role-1' });

    await service.update('director-1', { active: true }, 'team-1', 'user-1');

    expect(generation.generateInTransaction).toHaveBeenCalledWith(
      tx,
      'team-1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(ledger.applyAvailableCreditsInTransaction).toHaveBeenCalledWith(tx, 'team-1');
  });

  it('does not regenerate obligations when an already active director is edited', async () => {
    directorFindUnique.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: true });
    directorUpdate.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: true });
    roleFindFirst.mockResolvedValue({ id: 'role-1', startsAt: new Date('2026-01-01'), endsAt: null });

    await service.update('director-1', { name: 'Novo nome', active: true }, 'team-1', 'user-1');

    expect(generation.generateInTransaction).not.toHaveBeenCalled();
    expect(ledger.applyAvailableCreditsInTransaction).not.toHaveBeenCalled();
  });

  it('repairs a missing active role and generates the related obligations', async () => {
    directorFindUnique.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: true });
    directorUpdate.mockResolvedValue({ id: 'director-1', memberId: 'member-1', active: true });
    roleFindFirst.mockResolvedValue(null);

    await service.update('director-1', { active: true }, 'team-1', 'user-1');

    expect(roleCreate).toHaveBeenCalled();
    expect(generation.generateInTransaction).toHaveBeenCalled();
  });
});
