import { GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from './games.service';
import { CollectionsGenerationService } from '../collections/collections-generation.service';
import { CollectionsLedgerService } from '../collections/collections-ledger.service';
import { CollectionsReconciliationService } from '../collections/collections-reconciliation.service';

describe('GamesService tenant isolation', () => {
  const findMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const findUnique = jest.fn<Promise<unknown>, [unknown]>();
  const create = jest.fn<Promise<unknown>, [unknown]>();
  const update = jest.fn<Promise<unknown>, [unknown]>();
  const transactionCount = jest.fn();
  const obligationFindMany = jest.fn();
  const obligationDeleteMany = jest.fn();
  const prisma = {
    game: { findMany, findUnique, create, update },
    transaction: { count: transactionCount },
    collectionObligation: { findMany: obligationFindMany, deleteMany: obligationDeleteMany },
  } as unknown as PrismaService;
  const reconciliation = {
    runSerializable: jest.fn((operation: (client: PrismaService) => Promise<unknown>) => operation(prisma)),
  } as unknown as CollectionsReconciliationService;
  const generation = { generateInTransaction: jest.fn() } as unknown as CollectionsGenerationService;
  const ledger = { applyAvailableCreditsInTransaction: jest.fn() } as unknown as CollectionsLedgerService;
  const service = new GamesService(prisma, reconciliation, generation, ledger);

  beforeEach(() => jest.clearAllMocks());

  it('filters lists by the active team', async () => {
    findMany.mockResolvedValue([]);
    await service.list('team-1');
    expect(findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      orderBy: { date: 'desc' },
    });
  });

  it('stamps the active team when creating a game', async () => {
    create.mockResolvedValue({ id: 'game-1', date: new Date('2026-09-26T12:00:00.000Z') });
    await service.create(
      {
        date: '2026-09-26T12:00:00.000Z',
        status: GameStatus.ABERTO,
        expectedContributionPerDirector: 70,
      },
      'team-1',
    );
    expect(create).toHaveBeenCalled();
    const createCall = create.mock.calls[0]?.[0] as unknown as { data: { teamId: string } };
    expect(createCall.data.teamId).toBe('team-1');
    expect(generation.generateInTransaction).toHaveBeenCalledWith(
      prisma,
      'team-1',
      '2026-09-26',
      '2026-09-26',
    );
  });

  it('uses a composite key when updating a game', async () => {
    findUnique.mockResolvedValue({ id: 'game-1', date: new Date('2026-09-26') });
    update.mockResolvedValue({ id: 'game-1', date: new Date('2026-09-26') });
    await service.update('game-1', { opponent: 'Rival' }, 'team-1');
    expect(update).toHaveBeenCalledWith({
      where: { id_teamId: { id: 'game-1', teamId: 'team-1' } },
      data: { opponent: 'Rival' },
    });
  });

  it('blocks financial game changes after a transaction exists', async () => {
    findUnique.mockResolvedValue({ id: 'game-1', date: new Date('2026-09-26') });
    transactionCount.mockResolvedValue(1);
    obligationFindMany.mockResolvedValue([]);

    await expect(service.update(
      'game-1', { expectedContributionPerDirector: 90 }, 'team-1',
    )).rejects.toThrow('Não é possível alterar data ou valor de um jogo com movimentação financeira.');

    expect(update).not.toHaveBeenCalled();
  });
});
