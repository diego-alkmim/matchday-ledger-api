import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsMaintenanceService } from './collections-maintenance.service';

describe('CollectionsMaintenanceService', () => {
  const teamFindMany = jest.fn();
  const generate = jest.fn();
  const applyAvailableCredits = jest.fn();
  const prisma = { team: { findMany: teamFindMany } } as unknown as PrismaService;
  const generation = { generate } as unknown as CollectionsGenerationService;
  const ledger = { applyAvailableCredits } as unknown as CollectionsLedgerService;
  const service = new CollectionsMaintenanceService(prisma, generation, ledger);

  beforeEach(() => jest.clearAllMocks());

  it('backfills every month since the earliest plan and applies credits', async () => {
    teamFindMany.mockResolvedValue([
      { id: 'team-1', collectionPlans: [{ effectiveFrom: new Date('2026-07-01') }] },
      { id: 'team-2', collectionPlans: [{ effectiveFrom: new Date('2026-09-01') }] },
    ]);

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(teamFindMany).toHaveBeenCalledWith({
      where: { active: true },
      select: {
        id: true,
        collectionPlans: {
          orderBy: { effectiveFrom: 'asc' }, take: 1, select: { effectiveFrom: true },
        },
      },
    });
    expect(generate).toHaveBeenNthCalledWith(1, 'team-1', '2026-07-01', '2026-09-30');
    expect(generate).toHaveBeenNthCalledWith(2, 'team-2', '2026-09-01', '2026-09-30');
    expect(applyAvailableCredits).toHaveBeenCalledTimes(2);
  });

  it('ignores teams without collection plans', async () => {
    teamFindMany.mockResolvedValue([{ id: 'team-1', collectionPlans: [] }]);

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(generate).not.toHaveBeenCalled();
    expect(applyAvailableCredits).not.toHaveBeenCalled();
  });

  it('starts automatic maintenance during module initialization', () => {
    const run = jest.spyOn(service, 'runNow').mockResolvedValue();

    service.onModuleInit();

    expect(run).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});
