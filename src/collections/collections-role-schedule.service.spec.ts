import { MemberRole } from '@prisma/client';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsRoleScheduleService } from './collections-role-schedule.service';

jest.mock('./collection-date', () => ({
  collectionToday: () => new Date('2026-09-29T00:00:00.000Z'),
}));

describe('CollectionsRoleScheduleService', () => {
  const memberFindUnique = jest.fn();
  const roleUpdate = jest.fn();
  const tx = {
    member: { findUnique: memberFindUnique },
    memberRoleAssignment: { update: roleUpdate },
  };
  const reconciliation = {
    runSerializable: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    reconcileInTransaction: jest.fn(),
  } as unknown as CollectionsReconciliationService;
  const generateInTransaction = jest.fn();
  const applyAvailableCreditsInTransaction = jest.fn();
  const generation = { generateInTransaction } as unknown as CollectionsGenerationService;
  const ledger = { applyAvailableCreditsInTransaction } as unknown as CollectionsLedgerService;
  const service = new CollectionsRoleScheduleService(reconciliation, generation, ledger);

  beforeEach(() => jest.clearAllMocks());

  it('reschedules a future role selected by its assignment id', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'),
      roles: [{
        id: 'role-future', role: MemberRole.PLAYER,
        startsAt: new Date('2026-11-01'), endsAt: null,
      }],
    });
    roleUpdate.mockResolvedValue({ id: 'role-future', startsAt: new Date('2026-12-01') });

    await service.reschedule('team-1', 'member-1', 'role-future', '2026-12-01', 'user-1');

    expect(roleUpdate).toHaveBeenCalledWith({
      where: { id: 'role-future' }, data: { startsAt: new Date('2026-12-01') },
    });
    expect(reconciliation.reconcileInTransaction).toHaveBeenCalledWith(
      tx, 'team-1', 'user-1', 'member-1',
    );
    expect(generateInTransaction).not.toHaveBeenCalled();
  });

  it('generates current obligations when a scheduled role is moved to today', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'),
      roles: [{
        id: 'role-future', role: MemberRole.PLAYER,
        startsAt: new Date('2026-11-01'), endsAt: null,
      }],
    });
    roleUpdate.mockResolvedValue({ id: 'role-future', startsAt: new Date('2026-09-29') });

    await service.reschedule('team-1', 'member-1', 'role-future', '2026-09-29', 'user-1');

    expect(generateInTransaction).toHaveBeenCalledWith(
      tx, 'team-1', '2026-09-29', '2026-09-29',
    );
    expect(applyAvailableCreditsInTransaction).toHaveBeenCalledWith(tx, 'team-1');
  });

  it('rejects a new date that overlaps another period of the same role', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'),
      roles: [
        { id: 'current', role: MemberRole.PLAYER, startsAt: new Date('2026-01-01'), endsAt: new Date('2026-11-30') },
        { id: 'future', role: MemberRole.PLAYER, startsAt: new Date('2026-12-01'), endsAt: null },
      ],
    });

    await expect(service.reschedule(
      'team-1', 'member-1', 'future', '2026-11-01', 'user-1',
    )).rejects.toThrow('A nova data sobrepõe outro período desta função.');

    expect(roleUpdate).not.toHaveBeenCalled();
  });

  it('rejects moving a finite scheduled role beyond its end date', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'),
      roles: [{
        id: 'future', role: MemberRole.DIRECTOR,
        startsAt: new Date('2026-11-01'), endsAt: new Date('2026-11-30'),
      }],
    });

    await expect(service.reschedule(
      'team-1', 'member-1', 'future', '2026-12-01', 'user-1',
    )).rejects.toThrow('A nova data não pode ser posterior ao término agendado da função.');
  });

  it('allows a finite role period that ends before a later period starts', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'member-1', activeFrom: new Date('2026-01-01'),
      roles: [
        {
          id: 'target', role: MemberRole.PLAYER,
          startsAt: new Date('2026-11-15'), endsAt: new Date('2026-11-30'),
        },
        {
          id: 'later', role: MemberRole.PLAYER,
          startsAt: new Date('2026-12-01'), endsAt: null,
        },
      ],
    });
    roleUpdate.mockResolvedValue({ id: 'target', startsAt: new Date('2026-11-01') });

    await expect(service.reschedule(
      'team-1', 'member-1', 'target', '2026-11-01', 'user-1',
    )).resolves.toEqual({ id: 'target', startsAt: new Date('2026-11-01') });

    expect(roleUpdate).toHaveBeenCalledTimes(1);
  });
});
