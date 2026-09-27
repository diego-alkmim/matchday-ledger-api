import { ContributionMode } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateContributionSettingsDto } from './update-contribution-settings.dto';

describe('UpdateContributionSettingsDto', () => {
  it('requires a monthly amount in monthly mode', async () => {
    const dto = plainToInstance(UpdateContributionSettingsDto, {
      mode: ContributionMode.MONTHLY,
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'monthlyContributionPerDirector' }),
      ]),
    );
  });

  it('rejects an invalid monthly amount even in per-game mode', async () => {
    const dto = plainToInstance(UpdateContributionSettingsDto, {
      mode: ContributionMode.PER_GAME,
      monthlyContributionPerDirector: -1,
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'monthlyContributionPerDirector' }),
      ]),
    );
  });
});
