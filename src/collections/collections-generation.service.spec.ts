import { CollectionFrequency, MemberRole, Prisma, ProrationPolicy } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGenerationService } from './collections-generation.service';

describe('CollectionsGenerationService', () => {
  const planFindMany = jest.fn();
  const memberFindMany = jest.fn();
  const gameFindMany = jest.fn();
  const obligationUpsert = jest.fn();
  const prisma = {
    collectionPlan: { findMany: planFindMany },
    member: { findMany: memberFindMany },
    game: { findMany: gameFindMany },
    collectionObligation: { upsert: obligationUpsert },
  } as unknown as PrismaService;
  const service = new CollectionsGenerationService(prisma);
  const now = new Date('2026-09-01T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    gameFindMany.mockResolvedValue([]);
    obligationUpsert.mockResolvedValue({ createdAt: now, updatedAt: now });
  });

  it('creates monthly obligations without requiring games and applies role priority', async () => {
    planFindMany.mockResolvedValue([
      plan('director-plan', MemberRole.DIRECTOR, 100),
      plan('player-plan', MemberRole.PLAYER, 50),
    ]);
    memberFindMany.mockResolvedValue([{ id: 'member-1', roles: [role(MemberRole.DIRECTOR), role(MemberRole.PLAYER)] }]);

    await service.generate('team-1', '2026-09-01', '2026-09-30');

    expect(obligationUpsert).toHaveBeenCalledTimes(1);
    expect(obligationUpsert.mock.calls[0][0].create).toMatchObject({
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

    expect(obligationUpsert.mock.calls[0][0].create).toMatchObject({
      gameId: 'game-1',
      originalAmount: new Prisma.Decimal(85),
      expectedAmount: new Prisma.Decimal(85),
    });
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
