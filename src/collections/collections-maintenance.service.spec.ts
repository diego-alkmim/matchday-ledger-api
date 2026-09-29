import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsMaintenanceService } from './collections-maintenance.service';

describe('CollectionsMaintenanceService', () => {
  const teamFindMany = jest.fn();
  const teamUpdate = jest.fn();
  const generate = jest.fn();
  const applyAvailableCredits = jest.fn();
  const prisma = { team: { findMany: teamFindMany, update: teamUpdate } } as unknown as PrismaService;
  const generation = { generate } as unknown as CollectionsGenerationService;
  const ledger = { applyAvailableCredits } as unknown as CollectionsLedgerService;
  const service = new CollectionsMaintenanceService(prisma, generation, ledger);

  beforeEach(() => jest.resetAllMocks());

  it('backfills from the earliest plan once and saves the generation watermark', async () => {
    teamFindMany.mockResolvedValue([
      {
        id: 'team-1', collectionsGeneratedThrough: null,
        collectionPlans: [{ effectiveFrom: new Date('2026-07-01') }],
      },
    ]);

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(teamFindMany).toHaveBeenCalledWith({
      where: {
        active: true,
        collectionPlans: {
          some: { effectiveFrom: { lte: new Date('2026-09-30T00:00:00.000Z') } },
        },
      },
      select: {
        id: true,
        collectionsGeneratedThrough: true,
        collectionPlans: {
          where: { effectiveFrom: { lte: new Date('2026-09-30T00:00:00.000Z') } },
          orderBy: { effectiveFrom: 'asc' }, take: 1, select: { effectiveFrom: true },
        },
      },
    });
    expect(generate).toHaveBeenCalledWith('team-1', '2026-07-01', '2026-09-30');
    expect(applyAvailableCredits).toHaveBeenCalledWith('team-1');
    expect(teamUpdate).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { collectionsGeneratedThrough: new Date('2026-09-30T00:00:00.000Z') },
    });
  });

  it('generates only the period after the persisted watermark', async () => {
    teamFindMany.mockResolvedValue([{
      id: 'team-1', collectionsGeneratedThrough: new Date('2026-07-31'),
      collectionPlans: [{ effectiveFrom: new Date('2026-01-01') }],
    }]);

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(generate).toHaveBeenCalledWith('team-1', '2026-08-01', '2026-09-30');
    expect(teamUpdate).toHaveBeenCalledTimes(1);
  });

  it('rechecks only the current month when it was already generated', async () => {
    teamFindMany.mockResolvedValue([{
      id: 'team-1', collectionsGeneratedThrough: new Date('2026-09-30'),
      collectionPlans: [{ effectiveFrom: new Date('2026-01-01') }],
    }]);

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(generate).toHaveBeenCalledWith('team-1', '2026-09-01', '2026-09-30');
    expect(applyAvailableCredits).toHaveBeenCalledWith('team-1');
    expect(teamUpdate).toHaveBeenCalledTimes(1);
  });

  it('ignores teams without eligible collection plans defensively', async () => {
    teamFindMany.mockResolvedValue([{
      id: 'team-1', collectionsGeneratedThrough: null, collectionPlans: [],
    }]);

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(generate).not.toHaveBeenCalled();
    expect(applyAvailableCredits).not.toHaveBeenCalled();
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it('does not advance the watermark when generation fails', async () => {
    teamFindMany.mockResolvedValue([{
      id: 'team-1', collectionsGeneratedThrough: null,
      collectionPlans: [{ effectiveFrom: new Date('2026-09-01') }],
    }]);
    generate.mockRejectedValue(new Error('database unavailable'));

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it('does not advance the watermark when applying credits fails', async () => {
    teamFindMany.mockResolvedValue([{
      id: 'team-1', collectionsGeneratedThrough: null,
      collectionPlans: [{ effectiveFrom: new Date('2026-09-01') }],
    }]);
    applyAvailableCredits.mockRejectedValue(new Error('credit allocation failed'));

    await service.runNow(new Date('2026-09-29T15:00:00.000Z'));

    expect(generate).toHaveBeenCalledTimes(1);
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it('starts automatic maintenance during module initialization', () => {
    const run = jest.spyOn(service, 'runNow').mockResolvedValue();

    service.onModuleInit();

    expect(run).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});
