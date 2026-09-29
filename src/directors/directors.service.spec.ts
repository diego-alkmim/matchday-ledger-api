import { PrismaService } from '../prisma/prisma.service';
import { CollectionsReconciliationService } from '../collections/collections-reconciliation.service';
import { DirectorsService } from './directors.service';

describe('DirectorsService collection role lifecycle', () => {
  const directorFindUnique = jest.fn();
  const directorUpdate = jest.fn();
  const roleFindFirst = jest.fn();
  const roleUpdate = jest.fn();
  const roleDeleteMany = jest.fn();
  const roleCount = jest.fn();
  const memberUpdate = jest.fn();
  const tx = {
    director: { update: directorUpdate },
    memberRoleAssignment: {
      findFirst: roleFindFirst,
      update: roleUpdate,
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
  const service = new DirectorsService(prisma, reconciliation);

  beforeEach(() => jest.clearAllMocks());

  it('shortens a scheduled director role when the director is deactivated now', async () => {
    const futureEnd = new Date('2026-12-31');
    directorFindUnique.mockResolvedValue({ id: 'director-1', memberId: 'member-1' });
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
    expect(reconciliation.reconcileInTransaction).toHaveBeenCalledWith(tx, 'team-1', 'user-1');
  });
});
