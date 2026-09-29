import { generateObligationsThroughToday } from './collections-generation-range';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';

describe('generateObligationsThroughToday', () => {
  const generateInTransaction = jest.fn();
  const applyAvailableCreditsInTransaction = jest.fn();
  const generation = { generateInTransaction } as unknown as CollectionsGenerationService;
  const ledger = { applyAvailableCreditsInTransaction } as unknown as CollectionsLedgerService;
  const tx = {} as never;

  beforeEach(() => jest.clearAllMocks());

  it('scopes generation and credit allocation to the affected member', async () => {
    generateInTransaction.mockResolvedValue({ created: 1 });

    await generateObligationsThroughToday(
      generation,
      ledger,
      tx,
      'team-1',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-29T00:00:00.000Z'),
      'member-1',
    );

    expect(generateInTransaction).toHaveBeenCalledWith(
      tx, 'team-1', '2026-09-01', '2026-09-29', 'member-1',
    );
    expect(applyAvailableCreditsInTransaction).toHaveBeenCalledWith(
      tx, 'team-1', 'member-1',
    );
  });

  it('skips the credit scan when generation creates no obligations', async () => {
    generateInTransaction.mockResolvedValue({ created: 0 });

    await generateObligationsThroughToday(
      generation,
      ledger,
      tx,
      'team-1',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-29T00:00:00.000Z'),
      'member-1',
    );

    expect(applyAvailableCreditsInTransaction).not.toHaveBeenCalled();
  });
});
