import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsMaintenanceService } from './collections-maintenance.service';
import { CollectionsRoleScheduleService } from './collections-role-schedule.service';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsService } from './collections.service';

@Module({
  controllers: [CollectionsController],
  providers: [
    CollectionsService,
    CollectionsGenerationService,
    CollectionsLedgerService,
    CollectionsMaintenanceService,
    CollectionsReconciliationService,
    CollectionsRoleScheduleService,
  ],
  exports: [CollectionsGenerationService, CollectionsLedgerService, CollectionsReconciliationService],
})
export class CollectionsModule {}
