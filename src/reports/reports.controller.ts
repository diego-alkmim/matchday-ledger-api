import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiTags('Reports')
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private service: ReportsService) {}
  @Get('by-game') byGame(@Query('gameId') gameId: string) { return this.service.byGame(gameId); }
  @Get('monthly') monthly(@Query('from') from: string, @Query('to') to: string) { return this.service.monthly(from, to); }
  @Get('by-category') byCategory(@Query('from') from: string, @Query('to') to: string) { return this.service.byCategory(from, to); }

  @Get('analytical-by-game')
  @ApiOperation({ summary: 'Relatório analítico por jogo' })
  @ApiQuery({ name: 'from', required: false, example: '2026-02-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-02-29' })
  @ApiQuery({ name: 'gameId', required: false, example: 'cuid-do-jogo' })
  analyticalByGame(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('gameId') gameId?: string,
  ) {
    return this.service.analyticalByGame(from, to, gameId);
  }

  @Get('consolidated-by-director')
  @ApiOperation({ summary: 'Relatório consolidado por diretor' })
  @ApiQuery({ name: 'from', required: false, example: '2026-02-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-02-29' })
  @ApiQuery({ name: 'expectedPerGame', required: false, example: 70 })
  consolidatedByDirector(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('expectedPerGame') expectedPerGame?: string,
  ) {
    const parsedExpected = expectedPerGame ? Number(expectedPerGame) : 70;
    return this.service.consolidatedByDirector(from, to, Number.isFinite(parsedExpected) ? parsedExpected : 70);
  }
}
