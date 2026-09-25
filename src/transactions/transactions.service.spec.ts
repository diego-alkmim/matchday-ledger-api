import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const transaction = jest.fn((operations: Promise<unknown>[]) => Promise.all(operations));
  const prisma = {
    transaction: { findMany, count },
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new TransactionsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('paginates and filters transactions before querying the database', async () => {
    findMany.mockResolvedValueOnce([{ id: 'transaction-1' }]);
    count.mockResolvedValueOnce(21);

    await expect(
      service.list({
        page: 2,
        pageSize: 20,
        gameId: 'game-1',
        type: TransactionType.ENTRADA,
      }),
    ).resolves.toEqual({
      items: [{ id: 'transaction-1' }],
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: { gameId: 'game-1', type: 'ENTRADA' },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { gameId: 'game-1', type: 'ENTRADA' } });
  });

  it('keeps the legacy array response when pagination is not requested', async () => {
    findMany.mockResolvedValueOnce([{ id: 'transaction-1' }]);

    await expect(service.list({})).resolves.toEqual([{ id: 'transaction-1' }]);
    expect(count).not.toHaveBeenCalled();
  });
});
