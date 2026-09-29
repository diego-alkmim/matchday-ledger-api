import { MemberRole } from '@prisma/client';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsRoleScheduleService } from './collections-role-schedule.service';

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
  const service = new CollectionsRoleScheduleService(reconciliation);

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
    expect(reconciliation.reconcileInTransaction).toHaveBeenCalledWith(tx, 'team-1', 'user-1');
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
});
