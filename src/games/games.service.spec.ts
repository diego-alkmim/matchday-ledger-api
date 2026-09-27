import { GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from './games.service';

describe('GamesService tenant isolation', () => {
  const findMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const findUnique = jest.fn<Promise<unknown>, [unknown]>();
  const create = jest.fn<Promise<unknown>, [unknown]>();
  const update = jest.fn<Promise<unknown>, [unknown]>();
  const prisma = { game: { findMany, findUnique, create, update } } as unknown as PrismaService;
  const service = new GamesService(prisma);

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
    create.mockResolvedValue({ id: 'game-1' });
    await service.create(
      { date: '2026-09-26T12:00:00.000Z', status: GameStatus.ABERTO },
      'team-1',
    );
    expect(create).toHaveBeenCalled();
    const createCall = create.mock.calls[0]?.[0] as unknown as { data: { teamId: string } };
    expect(createCall.data.teamId).toBe('team-1');
  });

  it('uses a composite key when updating a game', async () => {
    findUnique.mockResolvedValue({ id: 'game-1' });
    update.mockResolvedValue({ id: 'game-1' });
    await service.update('game-1', { opponent: 'Rival' }, 'team-1');
    expect(update).toHaveBeenCalledWith({
      where: { id_teamId: { id: 'game-1', teamId: 'team-1' } },
      data: { opponent: 'Rival' },
    });
  });
});
