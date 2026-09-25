import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const transaction = jest.fn((operations: Promise<unknown>[]) => Promise.all(operations));
  const prisma = {
    game: { findMany, count },
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

    const result = await service.analyticalByGame({ page: 2, pageSize: 20 });

    if (Array.isArray(result)) {
      throw new Error('Expected a paginated analytical report response');
    }

    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
    expect(result.items[0].transactions).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20, orderBy: { date: 'desc' } }),
    );
  });

  it('keeps the legacy array response when pagination is not requested', async () => {
    findMany.mockResolvedValueOnce([]);

    await expect(service.analyticalByGame({})).resolves.toEqual([]);
    expect(count).not.toHaveBeenCalled();
  });
});
