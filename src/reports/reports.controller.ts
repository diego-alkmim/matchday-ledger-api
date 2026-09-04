import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AnalyticalByGameQueryDto } from './dto/analytical-by-game-query.dto';
import { ByGameReportQueryDto } from './dto/by-game-report-query.dto';
import { ConsolidatedByDirectorQueryDto } from './dto/consolidated-by-director-query.dto';
import { DateRangeRequiredQueryDto } from './dto/date-range-required-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiTags('Reports')
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('by-game')
  byGame(@Query() query: ByGameReportQueryDto) {
    return this.service.byGame(query.gameId);
  }

  @Get('monthly')
  monthly(@Query() query: DateRangeRequiredQueryDto) {
    return this.service.monthly(query.from, query.to);
  }

  @Get('by-category')
  byCategory(@Query() query: DateRangeRequiredQueryDto) {
    return this.service.byCategory(query.from, query.to);
  }

  @Get('analytical-by-game')
  @ApiOperation({ summary: 'Relatório analítico por jogo' })
  @ApiQuery({ name: 'from', required: false, example: '2026-02-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-02-29' })
  @ApiQuery({ name: 'gameId', required: false, example: 'cuid-do-jogo' })
  analyticalByGame(@Query() query: AnalyticalByGameQueryDto) {
    return this.service.analyticalByGame(query.from, query.to, query.gameId);
  }

  @Get('consolidated-by-director')
  @ApiOperation({ summary: 'Relatório consolidado por diretor' })
  @ApiQuery({ name: 'from', required: false, example: '2026-02-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-02-29' })
  @ApiQuery({ name: 'expectedPerGame', required: false, example: 70 })
  consolidatedByDirector(@Query() query: ConsolidatedByDirectorQueryDto) {
    return this.service.consolidatedByDirector(
      query.from,
      query.to,
      query.expectedPerGame ?? 70,
    );
  }
}
