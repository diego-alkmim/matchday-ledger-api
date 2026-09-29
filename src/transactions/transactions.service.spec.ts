import { PrismaService } from '../prisma/prisma.service';
import { CategoryType, GameStatus, PaymentMethod, Role, TransactionType } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  const findMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const count = jest.fn();
  const gameFindUnique = jest.fn();
  const categoryFindUnique = jest.fn();
  const directorFindUnique = jest.fn();
  const collectionPlanFindFirst = jest.fn();
  const create = jest.fn<Promise<unknown>, [unknown]>();
  const transactionFindUnique = jest.fn();
  const transactionUpdate = jest.fn();
  const transaction = jest.fn((operations: Promise<unknown>[]) => Promise.all(operations));
  const prisma = {
    transaction: { findMany, count, create, findUnique: transactionFindUnique, update: transactionUpdate },
    game: { findUnique: gameFindUnique },
    category: { findUnique: categoryFindUnique },
    director: { findUnique: directorFindUnique },
    collectionPlan: { findFirst: collectionPlanFindFirst },
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new TransactionsService(prisma);
  const user: AccessTokenPayload = {
    tokenType: 'access',
    sub: 'user-1',
    sessionId: 'session-1',
    membershipId: 'membership-1',
    teamId: 'team-1',
    teamName: 'Team One',
    teamSlug: 'team-one',
    role: Role.ADMIN,
    directorId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    collectionPlanFindFirst.mockResolvedValue(null);
  });

  it('paginates and filters transactions before querying the database', async () => {
    findMany.mockResolvedValueOnce([{ id: 'transaction-1' }]);
    count.mockResolvedValueOnce(21);

    await expect(
      service.list(
        {
          page: 2,
          pageSize: 20,
          gameId: 'game-1',
          type: TransactionType.ENTRADA,
        },
        'team-1',
      ),
    ).resolves.toEqual({
      items: [{ id: 'transaction-1' }],
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    });

    expect(findMany).toHaveBeenCalled();
    const findArgs = findMany.mock.calls[0]?.[0] as unknown as {
      skip: number;
      take: number;
      where: Record<string, unknown>;
    };
    expect(findArgs.skip).toBe(20);
    expect(findArgs.take).toBe(20);
    expect(findArgs.where).toEqual({ teamId: 'team-1', gameId: 'game-1', type: 'ENTRADA', reversedAt: null });
    expect(count).toHaveBeenCalledWith({
      where: { teamId: 'team-1', gameId: 'game-1', type: 'ENTRADA', reversedAt: null },
    });
  });

  it('keeps the legacy array response when pagination is not requested', async () => {
    findMany.mockResolvedValueOnce([{ id: 'transaction-1' }]);

    await expect(service.list({}, 'team-1')).resolves.toEqual([{ id: 'transaction-1' }]);
    expect(count).not.toHaveBeenCalled();
  });

  it('creates a transaction only with entities from the active team', async () => {
    gameFindUnique.mockResolvedValue({ status: GameStatus.ABERTO });
    categoryFindUnique.mockResolvedValue({ id: 'category-1', type: CategoryType.ENTRADA });
    directorFindUnique.mockResolvedValue({ id: 'director-1' });
    create.mockResolvedValue({ id: 'transaction-1' });

    await service.create(
      {
        type: TransactionType.ENTRADA,
        amount: 70,
        date: '2026-09-26',
        paymentMethod: PaymentMethod.PIX,
        gameId: 'game-1',
        categoryId: 'category-1',
        directorId: 'director-1',
      },
      user,
    );

    expect(gameFindUnique).toHaveBeenCalledWith({
      where: { id_teamId: { id: 'game-1', teamId: 'team-1' } },
    });
    expect(categoryFindUnique).toHaveBeenCalledWith({
      where: { id_teamId: { id: 'category-1', teamId: 'team-1' } },
    });
    expect(create).toHaveBeenCalled();
    const createArgs = create.mock.calls[0]?.[0] as unknown as {
      data: { teamId: string; createdByUserId: string };
    };
    expect(createArgs.data.teamId).toBe('team-1');
    expect(createArgs.data.createdByUserId).toBe('user-1');
  });

  it('blocks direct deletion of payments managed by collections', async () => {
    transactionFindUnique.mockResolvedValue({
      id: 'transaction-1',
      game: null,
      collectionPayment: { id: 'payment-1' },
    });

    await expect(service.remove('transaction-1', 'Motivo', user)).rejects.toThrow(
      'Pagamentos de arrecadação devem ser estornados no módulo de arrecadações.',
    );
    expect(transactionUpdate).not.toHaveBeenCalled();
  });

  it('soft-reverses ordinary transactions instead of deleting history', async () => {
    transactionFindUnique.mockResolvedValue({
      id: 'transaction-1',
      reversedAt: null,
      game: { status: GameStatus.ABERTO },
      collectionPayment: null,
    });
    transactionUpdate.mockResolvedValue({ id: 'transaction-1' });

    await service.remove('transaction-1', 'Valor incorreto', user);

    expect(transactionUpdate).toHaveBeenCalledWith({
      where: { id_teamId: { id: 'transaction-1', teamId: 'team-1' } },
      data: {
        reversedAt: expect.any(Date),
        reversedByUserId: 'user-1',
        reversalReason: 'Valor incorreto',
      },
    });
  });
});
