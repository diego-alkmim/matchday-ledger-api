import { CollectionFrequency, MemberRole, Prisma, ProrationPolicy } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGenerationService } from './collections-generation.service';

describe('CollectionsGenerationService', () => {
  const planFindMany = jest.fn();
  const memberFindMany = jest.fn();
  const gameFindMany = jest.fn();
  const obligationFindMany = jest.fn();
  const obligationCreateMany = jest.fn();
  const prisma = {
    collectionPlan: { findMany: planFindMany },
    member: { findMany: memberFindMany },
    game: { findMany: gameFindMany },
    collectionObligation: { findMany: obligationFindMany, createMany: obligationCreateMany },
  } as unknown as PrismaService;
  const service = new CollectionsGenerationService(prisma);
  beforeEach(() => {
    jest.clearAllMocks();
    gameFindMany.mockResolvedValue([]);
    obligationFindMany.mockResolvedValue([]);
    obligationCreateMany.mockImplementation(({ data }) => Promise.resolve({ count: data.length }));
  });

  it('creates monthly obligations without requiring games and applies role priority', async () => {
    planFindMany.mockResolvedValue([
      plan('director-plan', MemberRole.DIRECTOR, 100),
      plan('player-plan', MemberRole.PLAYER, 50),
    ]);
    memberFindMany.mockResolvedValue([{ id: 'member-1', roles: [role(MemberRole.DIRECTOR), role(MemberRole.PLAYER)] }]);

    await service.generate('team-1', '2026-09-01', '2026-09-30');

    expect(obligationCreateMany).toHaveBeenCalledTimes(1);
    expect(obligationCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      planId: 'director-plan',
      memberId: 'member-1',
      roleSnapshot: MemberRole.DIRECTOR,
    });
  });

  it('uses the amount stored on the game for director obligations', async () => {
    const directorPlan = plan('director-plan', MemberRole.DIRECTOR, 100, CollectionFrequency.PER_GAME);
    planFindMany.mockResolvedValue([directorPlan]);
    memberFindMany.mockResolvedValue([{ id: 'member-1', roles: [role(MemberRole.DIRECTOR)] }]);
    gameFindMany.mockResolvedValue([{ id: 'game-1', date: new Date('2026-09-10'), expectedContributionPerDirector: new Prisma.Decimal(85) }]);

    await service.generate('team-1', '2026-09-01', '2026-09-30');

    expect(obligationCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      gameId: 'game-1',
      originalAmount: new Prisma.Decimal(85),
      expectedAmount: new Prisma.Decimal(85),
    });
  });

  it('returns the database count instead of recounting existing obligations', async () => {
    planFindMany.mockResolvedValue([plan('director-plan', MemberRole.DIRECTOR, 100)]);
    memberFindMany.mockResolvedValue([{ id: 'member-1', roles: [role(MemberRole.DIRECTOR)] }]);
    obligationFindMany.mockResolvedValue([{
      planId: 'director-plan', memberId: 'member-1', competence: new Date('2026-09-01'), gameId: null,
    }]);

    await expect(service.generate('team-1', '2026-09-01', '2026-09-30')).resolves.toEqual({ created: 0 });
    expect(obligationCreateMany).not.toHaveBeenCalled();
  });

  it('rejects an oversized manual generation period before querying the database', async () => {
    await expect(service.generate(
      'team-1', '2025-01-01', '2026-01-02', 366,
    )).rejects.toThrow('O período máximo permitido é de 366 dias.');

    expect(planFindMany).not.toHaveBeenCalled();
    expect(memberFindMany).not.toHaveBeenCalled();
    expect(gameFindMany).not.toHaveBeenCalled();
  });

  it('limits member-specific generation queries to the requested member', async () => {
    planFindMany.mockResolvedValue([plan('director-plan', MemberRole.DIRECTOR, 100)]);
    memberFindMany.mockResolvedValue([{ id: 'member-1', roles: [role(MemberRole.DIRECTOR)] }]);

    await service.generateInTransaction(
      prisma, 'team-1', '2026-09-01', '2026-09-30', 'member-1',
    );

    expect(memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { teamId: 'team-1', activeFrom: { lte: new Date('2026-09-30') }, id: 'member-1' },
    }));
    expect(obligationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ teamId: 'team-1', memberId: 'member-1' }),
    }));
  });
});

function plan(id: string, audienceRole: MemberRole, priority: number, frequency: CollectionFrequency = CollectionFrequency.MONTHLY) {
  return {
    id,
    teamId: 'team-1',
    name: id,
    audienceRole,
    frequency,
    categoryId: 'category-1',
    priority,
    exclusiveGroup: 'membership',
    dueDay: 20,
    prorationPolicy: ProrationPolicy.DUE_DATE_CUTOFF,
    effectiveFrom: new Date('2026-09-01'),
    inactiveAt: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    rates: [{ id: `${id}-rate`, planId: id, amount: new Prisma.Decimal(70), effectiveFrom: new Date('2026-09-01'), createdAt: new Date() }],
  };
}

function role(value: MemberRole) {
  return { id: `${value}-role`, teamId: 'team-1', memberId: 'member-1', role: value, startsAt: new Date('2026-01-01'), endsAt: null, createdAt: new Date() };
}
