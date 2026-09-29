import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { CollectionsService } from './collections.service';
import { CollectionsRoleScheduleService } from './collections-role-schedule.service';
import {
  AddPlanRateDto,
  AdjustObligationDto,
  ChangeMemberRoleDto,
  CollectionPeriodQueryDto,
  CreateCollectionPaymentDto,
  CreateMemberDto,
  CreatePlanDto,
  EffectiveDateDto,
  GenerateObligationsDto,
  ReversePaymentDto,
} from './dto/collections.dto';

@Controller('collections')
@UseGuards(RolesGuard)
@ApiTags('Collections')
@ApiBearerAuth('access-token')
export class CollectionsController {
  constructor(
    private service: CollectionsService,
    private generation: CollectionsGenerationService,
    private ledger: CollectionsLedgerService,
    private roleSchedule: CollectionsRoleScheduleService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumo de obrigações e pagamentos do período' })
  summary(@Query() query: CollectionPeriodQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.summary(user.teamId, query.from, query.to);
  }

  @Get('members')
  listMembers(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listMembers(user.teamId);
  }

  @Post('members')
  @Roles(Role.ADMIN)
  createMember(@Body() dto: CreateMemberDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.createMember(user.teamId, dto);
  }

  @Patch('members/:id/deactivate')
  @Roles(Role.ADMIN)
  deactivateMember(@Param('id', ParseCuidPipe) id: string, @Body() dto: EffectiveDateDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.deactivateMember(user.teamId, id, dto.date, user.sub);
  }

  @Post('members/:id/roles')
  @Roles(Role.ADMIN)
  addMemberRole(@Param('id', ParseCuidPipe) id: string, @Body() dto: ChangeMemberRoleDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.addMemberRole(user.teamId, id, dto.role, dto.date, user.sub);
  }

  @Patch('members/:id/roles/end')
  @Roles(Role.ADMIN)
  endMemberRole(@Param('id', ParseCuidPipe) id: string, @Body() dto: ChangeMemberRoleDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.endMemberRole(user.teamId, id, dto.role, dto.date, user.sub, dto.assignmentId);
  }

  @Patch('members/:id/roles/:assignmentId')
  @Roles(Role.ADMIN)
  rescheduleMemberRole(
    @Param('id', ParseCuidPipe) id: string,
    @Param('assignmentId', ParseCuidPipe) assignmentId: string,
    @Body() dto: EffectiveDateDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.roleSchedule.reschedule(user.teamId, id, assignmentId, dto.date, user.sub);
  }

  @Get('plans')
  listPlans(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listPlans(user.teamId);
  }

  @Post('plans')
  @Roles(Role.ADMIN)
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.createPlan(user.teamId, dto, user.sub);
  }

  @Post('plans/:id/rates')
  @Roles(Role.ADMIN)
  addRate(@Param('id', ParseCuidPipe) id: string, @Body() dto: AddPlanRateDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.addRate(user.teamId, id, dto);
  }

  @Patch('plans/:id/deactivate')
  @Roles(Role.ADMIN)
  deactivatePlan(@Param('id', ParseCuidPipe) id: string, @Body() dto: EffectiveDateDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.deactivatePlan(user.teamId, id, dto.date, user.sub);
  }

  @Post('generate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Gera obrigações idempotentes no período' })
  async generate(@Body() dto: GenerateObligationsDto, @CurrentUser() user: AccessTokenPayload) {
    const result = await this.generation.generate(user.teamId, dto.from, dto.to, 366);
    await this.ledger.applyAvailableCredits(user.teamId);
    return result;
  }

  @Post('payments')
  @Roles(Role.ADMIN)
  createPayment(@Body() dto: CreateCollectionPaymentDto, @CurrentUser() user: AccessTokenPayload) {
    return this.ledger.createPayment(dto, user);
  }

  @Post('payments/:id/reverse')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Estorna pagamento sem apagar o histórico' })
  reversePayment(@Param('id', ParseCuidPipe) id: string, @Body() dto: ReversePaymentDto, @CurrentUser() user: AccessTokenPayload) {
    return this.ledger.reversePayment(id, dto.reason, user);
  }

  @Post('obligations/:id/adjustments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Aplica desconto, acréscimo, isenção ou cancelamento' })
  adjustObligation(@Param('id', ParseCuidPipe) id: string, @Body() dto: AdjustObligationDto, @CurrentUser() user: AccessTokenPayload) {
    return this.ledger.adjustObligation(id, dto, user);
  }

  @Post('adjustments/:id/reverse')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Estorna um ajuste e recalcula a obrigação' })
  reverseAdjustment(@Param('id', ParseCuidPipe) id: string, @Body() dto: ReversePaymentDto, @CurrentUser() user: AccessTokenPayload) {
    return this.ledger.reverseAdjustment(id, dto.reason, user);
  }
}
