import { CategoryType } from '@prisma/client';
import { CategoriesService } from '../../categories/categories.service';
import { DirectorsService } from '../../directors/directors.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Tenant isolation for team-owned records', () => {
  const categoryFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const categoryCreate = jest.fn<Promise<unknown>, [unknown]>();
  const directorFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const directorCreate = jest.fn<Promise<unknown>, [unknown]>();
  const prisma = {
    category: { findMany: categoryFindMany, create: categoryCreate },
    director: { findMany: directorFindMany, create: directorCreate },
  } as unknown as PrismaService;
  const categories = new CategoriesService(prisma);
  const directors = new DirectorsService(prisma);

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
    expect(directorFindMany).toHaveBeenCalledWith({
      where: { teamId: 'team-a' },
      orderBy: { name: 'asc' },
    });
  });

  it('ignores any external tenant context and stamps the active team on creation', async () => {
    categoryCreate.mockResolvedValue({ id: 'category-1' });
    directorCreate.mockResolvedValue({ id: 'director-1' });

    await categories.create({ name: 'Diretoria', type: CategoryType.ENTRADA }, 'team-b');
    await directors.create({ name: 'Director' }, 'team-b');

    expect(categoryCreate).toHaveBeenCalledWith({
      data: { name: 'Diretoria', type: CategoryType.ENTRADA, teamId: 'team-b' },
    });
    expect(directorCreate).toHaveBeenCalledWith({
      data: { name: 'Director', teamId: 'team-b' },
    });
  });
});
