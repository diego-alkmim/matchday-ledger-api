import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsService } from './collections.service';

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService, CollectionsGenerationService, CollectionsLedgerService, CollectionsReconciliationService],
})
export class CollectionsModule {}
