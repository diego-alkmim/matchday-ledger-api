import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiTags('Reports')
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private service: ReportsService) {}
  @Get('by-game') byGame(@Query('gameId') gameId: string) { return this.service.byGame(gameId); }
  @Get('monthly') monthly(@Query('from') from: string, @Query('to') to: string) { return this.service.monthly(from, to); }
  @Get('by-category') byCategory(@Query('from') from: string, @Query('to') to: string) { return this.service.byCategory(from, to); }
}
