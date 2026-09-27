import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const findMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const count = jest.fn();
  const groupBy = jest.fn<Promise<unknown[]>, [unknown]>();
  const transactionFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const directorFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const queryRaw = jest.fn<Promise<unknown[]>, unknown[]>();
  const teamFindUniqueOrThrow = jest.fn<Promise<unknown>, [unknown]>();
  const transaction = jest.fn((operations: Promise<unknown>[]) => Promise.all(operations));
  const prisma = {
    game: { findMany, count },
    transaction: { groupBy, findMany: transactionFindMany },
    director: { findMany: directorFindMany },
    team: { findUniqueOrThrow: teamFindUniqueOrThrow },
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new ReportsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('paginates analytical reports by game without splitting game transactions', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'game-1',
        date: new Date('2026-02-01T00:00:00.000Z'),
        opponent: 'Opponent',
        location: null,
        status: 'ABERTO',
        transactions: [
          {
            id: 'transaction-1',
            type: 'ENTRADA',
            amount: 70,
            paymentMethod: 'PIX',
            notes: null,
            createdAt: new Date('2026-02-01T00:00:00.000Z'),
            date: new Date('2026-02-01T00:00:00.000Z'),
            category: { name: 'Diretoria', type: 'ENTRADA' },
            director: { name: 'Director' },
          },
        ],
      },
    ]);
    count.mockResolvedValueOnce(21);

    const result = await service.analyticalByGame({ page: 2, pageSize: 20 }, 'team-1');

    if (Array.isArray(result)) {
      throw new Error('Expected a paginated analytical report response');
    }

    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
    expect(result.items[0].transactions).toHaveLength(1);
    expect(findMany).toHaveBeenCalled();
    const findArgs = findMany.mock.calls[0]?.[0] as unknown as {
      skip: number;
      take: number;
      orderBy: { date: string };
      where: { teamId: string };
    };
    expect(findArgs).toMatchObject({ skip: 20, take: 20, orderBy: { date: 'desc' } });
    expect(findArgs.where.teamId).toBe('team-1');
  });

  it('keeps the legacy array response when pagination is not requested', async () => {
    findMany.mockResolvedValueOnce([]);

    await expect(service.analyticalByGame({}, 'team-1')).resolves.toEqual([]);
    expect(count).not.toHaveBeenCalled();
  });

  it('scopes every summary report to the active team', async () => {
    groupBy.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);

    await service.byGame('game-1', 'team-1');
    await service.monthly('2026-01-01', '2026-12-31', 'team-1');
    await service.byCategory('2026-01-01', '2026-12-31', 'team-1');

    const groupArgs = groupBy.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(groupArgs.where).toEqual({ gameId: 'game-1', teamId: 'team-1' });
    expect(queryRaw.mock.calls[0]).toContain('team-1');
    expect(queryRaw.mock.calls[1]).toContain('team-1');
  });

  it('scopes director consolidation sources to the same active team', async () => {
    teamFindUniqueOrThrow.mockResolvedValue({
      contributionMode: 'PER_GAME',
      monthlyContributionPerDirector: 70,
    });
    findMany.mockResolvedValue([]);
    directorFindMany.mockResolvedValue([]);
    transactionFindMany.mockResolvedValue([]);

    await service.consolidatedByDirector(undefined, undefined, 'team-2');

    const gameArgs = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    const directorArgs = directorFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    const paymentArgs = transactionFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(gameArgs.where.teamId).toBe('team-2');
    expect(directorArgs.where.teamId).toBe('team-2');
    expect(paymentArgs.where.teamId).toBe('team-2');
  });

  it('filters contribution obligations and payments by game date', async () => {
    teamFindUniqueOrThrow.mockResolvedValue({
      contributionMode: 'PER_GAME',
      monthlyContributionPerDirector: 70,
    });
    findMany.mockResolvedValue([]);
    directorFindMany.mockResolvedValue([]);
    transactionFindMany.mockResolvedValue([]);

    await service.consolidatedByDirector('2026-01-01', '2026-01-31', 'team-1');

    const gameArgs = findMany.mock.calls[0]?.[0] as {
      where: { date: { gte: Date; lte: Date } };
    };
    const paymentArgs = transactionFindMany.mock.calls[0]?.[0] as {
      where: { game: { date: { gte: Date; lte: Date } } };
    };
    expect(gameArgs.where.date.gte.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(gameArgs.where.date.lte.toISOString()).toBe('2026-02-01T02:59:59.999Z');
    expect(paymentArgs.where.game.date).toEqual(gameArgs.where.date);
  });

  it('expands date filters to complete calendar months in monthly mode', async () => {
    teamFindUniqueOrThrow.mockResolvedValue({
      contributionMode: 'MONTHLY',
      monthlyContributionPerDirector: 250,
    });
    findMany.mockResolvedValue([]);
    directorFindMany.mockResolvedValue([]);
    transactionFindMany.mockResolvedValue([]);

    await service.consolidatedByDirector('2026-01-15', '2026-02-10', 'team-1');

    const gameArgs = findMany.mock.calls[0]?.[0] as {
      where: { date: { gte: Date; lte: Date } };
    };
    expect(gameArgs.where.date.gte.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(gameArgs.where.date.lte.toISOString()).toBe('2026-03-01T02:59:59.999Z');
  });
});
