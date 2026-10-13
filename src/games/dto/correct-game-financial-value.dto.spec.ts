import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CorrectGameFinancialValueDto } from './correct-game-financial-value.dto';

describe('CorrectGameFinancialValueDto', () => {
  it('accepts a positive monetary value and a reason', async () => {
    const dto = plainToInstance(CorrectGameFinancialValueDto, {
      expectedContributionPerDirector: '100',
      reason: 'Valor aprovado estava incorreto.',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.expectedContributionPerDirector).toBe(100);
  });

  it('rejects an invalid amount and an empty reason', async () => {
    const dto = plainToInstance(CorrectGameFinancialValueDto, {
      expectedContributionPerDirector: 0,
      reason: '',
    });
    const errors = await validate(dto);

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'expectedContributionPerDirector' }),
      expect.objectContaining({ property: 'reason' }),
    ]));
  });

  it('rejects a reason containing only spaces', async () => {
    const dto = plainToInstance(CorrectGameFinancialValueDto, {
      expectedContributionPerDirector: 100,
      reason: '   ',
    });

    await expect(validate(dto)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'reason' }),
    ]));
  });
});
