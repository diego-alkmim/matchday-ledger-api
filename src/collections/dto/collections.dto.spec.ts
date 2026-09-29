import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CollectionPeriodQueryDto } from './collections.dto';

describe('CollectionPeriodQueryDto', () => {
  it('accepts date-only values', async () => {
    const dto = plainToInstance(CollectionPeriodQueryDto, {
      from: '2026-09-01',
      to: '2026-09-30',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects timestamps because the service expects date-only values', async () => {
    const dto = plainToInstance(CollectionPeriodQueryDto, {
      from: '2026-09-01T12:00:00.000Z',
      to: '2026-09-30',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'from' })]),
    );
  });
});
