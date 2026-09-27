import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateContributionSettingsDto } from './dto/update-contribution-settings.dto';
import { TeamsService } from './teams.service';

@Controller('team-settings')
@UseGuards(RolesGuard)
@ApiTags('Team settings')
@ApiBearerAuth('access-token')
export class TeamsController {
  constructor(private service: TeamsService) {}

  @Get('contributions')
  @ApiOperation({
    summary: 'Consulta a regra de arrecadação do time ativo',
    description:
      'PER_GAME usa o valor registrado em cada jogo. MONTHLY cria uma obrigação por mês que tenha jogo.',
  })
  getContributionSettings(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getContributionSettings(user.teamId);
  }

  @Roles(Role.ADMIN)
  @Put('contributions')
  @ApiOperation({
    summary: 'Atualiza a regra de arrecadação do time ativo',
    description: 'Somente administradores podem alterar a periodicidade e o valor mensal.',
  })
  @ApiBody({ type: UpdateContributionSettingsDto })
  updateContributionSettings(
    @Body() body: UpdateContributionSettingsDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.updateContributionSettings(user.teamId, body);
  }
}
