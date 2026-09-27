import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AnalyticalByGameQueryDto } from './dto/analytical-by-game-query.dto';
import { ByGameReportQueryDto } from './dto/by-game-report-query.dto';
import { ConsolidatedByDirectorQueryDto } from './dto/consolidated-by-director-query.dto';
import { DateRangeRequiredQueryDto } from './dto/date-range-required-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@ApiTags('Reports')
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('by-game')
  byGame(@Query() query: ByGameReportQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.byGame(query.gameId, user.teamId);
  }

  @Get('monthly')
  monthly(@Query() query: DateRangeRequiredQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.monthly(query.from, query.to, user.teamId);
  }

  @Get('by-category')
  byCategory(@Query() query: DateRangeRequiredQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.byCategory(query.from, query.to, user.teamId);
  }

  @Get('analytical-by-game')
  @ApiOperation({ summary: 'Relatório analítico por jogo' })
  @ApiQuery({ name: 'from', required: false, example: '2026-02-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-02-29' })
  @ApiQuery({ name: 'gameId', required: false, example: 'cuid-do-jogo' })
  analyticalByGame(
    @Query() query: AnalyticalByGameQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.analyticalByGame(query, user.teamId);
  }

  @Get('consolidated-by-director')
  @ApiOperation({
    summary: 'Relatório consolidado por diretor',
    description:
      'Calcula automaticamente as obrigações pela regra do time: valor de cada jogo ou valor mensal configurado.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-02-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-02-29' })
  consolidatedByDirector(
    @Query() query: ConsolidatedByDirectorQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.consolidatedByDirector(query.from, query.to, user.teamId);
  }
}
