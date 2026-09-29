import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsolidatedByDirectorQueryDto } from './consolidated-by-director-query.dto';

describe('ConsolidatedByDirectorQueryDto', () => {
  it('requires both date boundaries', async () => {
    const dto = plainToInstance(ConsolidatedByDirectorQueryDto, { from: '2026-09-01' });
    const errors = await validate(dto);

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'to' }),
    ]));
  });
});
