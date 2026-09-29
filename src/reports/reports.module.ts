import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CollectionsDirectorReportService } from './collections-director-report.service';

@Module({
  providers: [ReportsService, CollectionsDirectorReportService],
  controllers: [ReportsController],
})
export class ReportsModule {}
