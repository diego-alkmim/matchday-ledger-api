import { Prisma } from '@prisma/client';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';

export async function generateObligationsThroughToday(
  generation: CollectionsGenerationService,
  ledger: CollectionsLedgerService,
  tx: Prisma.TransactionClient,
  teamId: string,
  from: Date,
  today: Date,
) {
  if (from > today) return;
  await generation.generateInTransaction(
    tx,
    teamId,
    from.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );
  await ledger.applyAvailableCreditsInTransaction(tx, teamId);
}
