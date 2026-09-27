import { GameStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGameDto } from './create-game.dto';

describe('CreateGameDto', () => {
  it('requires a positive expected contribution with at most two decimal places', async () => {
    const missingValue = plainToInstance(CreateGameDto, {
      date: '2026-09-27T12:00:00.000Z',
      status: GameStatus.ABERTO,
    });
    const invalidPrecision = plainToInstance(CreateGameDto, {
      date: '2026-09-27T12:00:00.000Z',
      status: GameStatus.ABERTO,
      expectedContributionPerDirector: 70.123,
    });

    await expect(validate(missingValue)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'expectedContributionPerDirector' }),
      ]),
    );
    await expect(validate(invalidPrecision)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'expectedContributionPerDirector' }),
      ]),
    );
  });
});
