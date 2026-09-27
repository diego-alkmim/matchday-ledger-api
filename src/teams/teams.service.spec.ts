import { ContributionMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';

describe('TeamsService contribution settings', () => {
  const findUniqueOrThrow = jest.fn<Promise<unknown>, [unknown]>();
  const update = jest.fn<Promise<unknown>, [unknown]>();
  const prisma = { team: { findUniqueOrThrow, update } } as unknown as PrismaService;
  const service = new TeamsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('returns normalized settings for the active team', async () => {
    findUniqueOrThrow.mockResolvedValue({
      contributionMode: ContributionMode.PER_GAME,
      monthlyContributionPerDirector: { toString: () => '280.00' },
    });

    await expect(service.getContributionSettings('team-1')).resolves.toEqual({
      mode: ContributionMode.PER_GAME,
      monthlyContributionPerDirector: 280,
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'team-1' } }),
    );
  });

  it('updates only the active team configuration', async () => {
    update.mockResolvedValue({});
    findUniqueOrThrow.mockResolvedValue({
      contributionMode: ContributionMode.MONTHLY,
      monthlyContributionPerDirector: 300,
    });

    await service.updateContributionSettings('team-2', {
      mode: ContributionMode.MONTHLY,
      monthlyContributionPerDirector: 300,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'team-2' },
      data: {
        contributionMode: ContributionMode.MONTHLY,
        monthlyContributionPerDirector: 300,
      },
    });
  });
});
