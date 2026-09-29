import { CategoryType } from '@prisma/client';
import { CategoriesService } from '../../categories/categories.service';
import { DirectorsService } from '../../directors/directors.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectionsReconciliationService } from '../../collections/collections-reconciliation.service';

describe('Tenant isolation for team-owned records', () => {
  const categoryFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const categoryCreate = jest.fn<Promise<unknown>, [unknown]>();
  const directorFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const directorCreate = jest.fn<Promise<unknown>, [unknown]>();
  const memberFindUnique = jest.fn();
  const memberCreate = jest.fn();
  const roleCreate = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma));
  const prisma = {
    category: { findMany: categoryFindMany, create: categoryCreate },
    director: { findMany: directorFindMany, create: directorCreate },
    member: { findUnique: memberFindUnique, create: memberCreate },
    memberRoleAssignment: { create: roleCreate },
    $transaction: transaction,
  } as unknown as PrismaService;
  const categories = new CategoriesService(prisma);
  const reconciliation = {
    reconcileInTransaction: jest.fn(),
    runSerializable: jest.fn((callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  } as unknown as CollectionsReconciliationService;
  const directors = new DirectorsService(prisma, reconciliation);

  beforeEach(() => jest.clearAllMocks());

  it('filters category and director lists by the active team', async () => {
    categoryFindMany.mockResolvedValue([]);
    directorFindMany.mockResolvedValue([]);

    await categories.list('team-a');
    await directors.list('team-a');

    expect(categoryFindMany).toHaveBeenCalledWith({
      where: { teamId: 'team-a' },
      orderBy: { name: 'asc' },
    });
    expect(directorFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ teamId: 'team-a' }),
      orderBy: { name: 'asc' },
    }));
  });

  it('ignores any external tenant context and stamps the active team on creation', async () => {
    categoryCreate.mockResolvedValue({ id: 'category-1' });
    directorCreate.mockResolvedValue({ id: 'director-1' });
    memberFindUnique.mockResolvedValue(null);
    memberCreate.mockResolvedValue({ id: 'member-1', roles: [] });

    await categories.create({ name: 'Diretoria', type: CategoryType.ENTRADA }, 'team-b');
    await directors.create({ name: 'Director' }, 'team-b', 'user-1');

    expect(categoryCreate).toHaveBeenCalledWith({
      data: { name: 'Diretoria', type: CategoryType.ENTRADA, teamId: 'team-b' },
    });
    expect(directorCreate).toHaveBeenCalledWith({
      data: { name: 'Director', teamId: 'team-b', memberId: 'member-1' },
    });
    expect(reconciliation.reconcileInTransaction).toHaveBeenCalledWith(
      prisma,
      'team-b',
      'user-1',
    );
  });
});
