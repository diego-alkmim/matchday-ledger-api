import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { ListGamesQueryDto } from './dto/list-games-query.dto';
import { CorrectGameFinancialValueDto } from './dto/correct-game-financial-value.dto';
import { GamesService } from './games.service';

@Controller('games')
@UseGuards(RolesGuard)
@ApiTags('Games')
@ApiBearerAuth('access-token')
export class GamesController {
  constructor(private service: GamesService) {}

  @Get()
  list(@Query() query: ListGamesQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.list(user.teamId, query);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({ type: CreateGameDto })
  create(@Body() body: CreateGameDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.create(body, user.teamId);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiBody({ type: UpdateGameDto })
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: UpdateGameDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.update(id, body, user.teamId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/financial-value')
  @ApiOperation({
    summary: 'Corrige o valor esperado de um jogo com movimentação financeira',
    description:
      'Registra uma correção auditável e ajusta as obrigações existentes sem apagar pagamentos, estornos ou histórico.',
  })
  @ApiBody({ type: CorrectGameFinancialValueDto })
  correctFinancialValue(
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: CorrectGameFinancialValueDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.correctFinancialValue(id, body, user.teamId, user.sub);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseCuidPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.service.remove(id, user.teamId);
  }

  @Roles(Role.ADMIN)
  @Post(':id/close')
  close(@Param('id', ParseCuidPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.service.setStatus(id, 'FECHADO', user.teamId);
  }

  @Roles(Role.ADMIN)
  @Post(':id/reopen')
  reopen(@Param('id', ParseCuidPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.service.setStatus(id, 'ABERTO', user.teamId);
  }
}
