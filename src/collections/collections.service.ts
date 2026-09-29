import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType, MemberRole, ObligationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddPlanRateDto, CreateMemberDto, CreatePlanDto } from './dto/collections.dto';
import { CollectionsReconciliationService } from './collections-reconciliation.service';

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private reconciliation: CollectionsReconciliationService,
  ) {}

  async listMembers(teamId: string) {
    const members = await this.prisma.member.findMany({
      where: { teamId },
      select: {
        id: true,
        name: true,
        active: true,
        activeFrom: true,
        inactiveAt: true,
        roles: { orderBy: { startsAt: 'desc' } },
        director: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    });
    const now = this.today();
    return members.map((member) => ({
      ...member,
      active:
        member.activeFrom <= now &&
        member.roles.some((role) => role.startsAt <= now && (!role.endsAt || role.endsAt >= now)),
    }));
  }

  createMember(teamId: string, dto: CreateMemberDto) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          teamId, name: dto.name.trim(), contact: dto.contact?.trim(), activeFrom: new Date(dto.activeFrom),
          roles: { create: [...new Set(dto.roles)].map((role) => ({ teamId, role, startsAt: new Date(dto.activeFrom) })) },
        },
        include: { roles: true },
      });
      if (dto.roles.includes(MemberRole.DIRECTOR)) {
        await tx.director.create({
          data: { teamId, memberId: member.id, name: member.name, contact: member.contact },
        });
      }
      return member;
    });
  }

  async deactivateMember(teamId: string, id: string, inactiveAt: string, actorId: string) {
    const date = new Date(inactiveAt);
    const today = this.today();
    const member = await this.prisma.member.findUnique({ where: { id_teamId: { id, teamId } } });
    if (!member) throw new NotFoundException('Participante não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const result = await Promise.all([
        tx.member.update({
          where: { id_teamId: { id, teamId } },
          data: { active: date >= today, inactiveAt: date },
        }),
        tx.memberRoleAssignment.updateMany({ where: { teamId, memberId: id, endsAt: null }, data: { endsAt: date } }),
        tx.director.updateMany({
          where: { teamId, memberId: id },
          data: { active: date >= today },
        }),
      ]);
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      return result;
    });
  }

  async addMemberRole(teamId: string, memberId: string, role: MemberRole, startsAt: string, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id_teamId: { id: memberId, teamId } },
        include: { roles: true, director: true },
      });
      if (!member) throw new NotFoundException('Participante não encontrado.');
      if (member.roles.some((item) => item.role === role && !item.endsAt)) {
        throw new BadRequestException('O participante já possui esta função ativa.');
      }
      await tx.member.update({ where: { id_teamId: { id: memberId, teamId } }, data: { active: true, inactiveAt: null } });
      const assignment = await tx.memberRoleAssignment.create({
        data: { teamId, memberId, role, startsAt: new Date(startsAt) },
      });
      if (role === MemberRole.DIRECTOR) {
        if (member.director) {
          await tx.director.update({ where: { id_teamId: { id: member.director.id, teamId } }, data: { active: true } });
        } else {
          await tx.director.create({ data: { teamId, memberId, name: member.name, contact: member.contact } });
        }
      }
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      return assignment;
    });
    return result;
  }

  async endMemberRole(teamId: string, memberId: string, role: MemberRole, endsAt: string, actorId: string) {
    const endDate = new Date(endsAt);
    const today = this.today();
    const result = await this.prisma.$transaction(async (tx) => {
      const result = await tx.memberRoleAssignment.updateMany({
        where: { teamId, memberId, role, endsAt: null },
        data: { endsAt: endDate },
      });
      if (result.count === 0) throw new NotFoundException('Função ativa não encontrada.');
      if (role === MemberRole.DIRECTOR) {
        await tx.director.updateMany({
          where: { teamId, memberId },
          data: { active: endDate >= today },
        });
      }
      const activeRoles = await tx.memberRoleAssignment.count({ where: { teamId, memberId, endsAt: null } });
      if (activeRoles === 0) {
        await tx.member.update({
          where: { id_teamId: { id: memberId, teamId } },
          data: { active: endDate >= today, inactiveAt: endDate },
        });
      }
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      return result;
    });
    return result;
  }

  async listPlans(teamId: string) {
    const plans = await this.prisma.collectionPlan.findMany({
      where: { teamId },
      include: { category: true, rates: { orderBy: { effectiveFrom: 'desc' } } },
      orderBy: [{ active: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    });
    const now = this.today();
    return plans.map((plan) => ({
      ...plan,
      active: plan.effectiveFrom <= now && (!plan.inactiveAt || plan.inactiveAt >= now),
    }));
  }

  async createPlan(teamId: string, dto: CreatePlanDto, actorId: string) {
    const category = await this.prisma.category.findUnique({ where: { id_teamId: { id: dto.categoryId, teamId } } });
    if (!category || category.type !== CategoryType.ENTRADA) {
      throw new BadRequestException('Selecione uma categoria de entrada do time.');
    }
    if (dto.frequency === 'MONTHLY' && !dto.dueDay) {
      throw new BadRequestException('Informe o dia de vencimento do plano mensal.');
    }
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.collectionPlan.create({
        data: {
          teamId, name: dto.name.trim(), audienceRole: dto.audienceRole, frequency: dto.frequency,
          categoryId: dto.categoryId, priority: dto.priority, exclusiveGroup: dto.exclusiveGroup,
          dueDay: dto.frequency === 'MONTHLY' ? dto.dueDay : null,
          prorationPolicy: dto.prorationPolicy, effectiveFrom: new Date(dto.effectiveFrom),
          rates: { create: { amount: dto.amount, effectiveFrom: new Date(dto.effectiveFrom) } },
        },
        include: { rates: true, category: true },
      });
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      return plan;
    });
  }

  async addRate(teamId: string, planId: string, dto: AddPlanRateDto) {
    const plan = await this.prisma.collectionPlan.findUnique({ where: { id_teamId: { id: planId, teamId } } });
    if (!plan) throw new NotFoundException('Plano não encontrado.');
    return this.prisma.collectionPlanRate.create({ data: { planId, amount: dto.amount, effectiveFrom: new Date(dto.effectiveFrom) } });
  }

  async deactivatePlan(teamId: string, planId: string, inactiveAt: string, actorId: string) {
    const date = new Date(inactiveAt);
    const today = this.today();
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.collectionPlan.update({
        where: { id_teamId: { id: planId, teamId } },
        data: { active: date >= today, inactiveAt: date },
      });
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      return plan;
    });
  }

  async summary(teamId: string, from?: string, to?: string) {
    const now = new Date();
    const periodFrom = from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const periodTo = to ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const where: Prisma.CollectionObligationWhereInput = {
      teamId,
      dueDate: { gte: new Date(periodFrom), lte: new Date(`${periodTo}T23:59:59.999Z`) },
    };
    const obligations = await this.prisma.collectionObligation.findMany({
      where,
      include: {
        member: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } },
        game: { select: { opponent: true, date: true } },
        adjustments: {
          where: { reversedAt: null },
          select: { id: true, type: true, amount: true, reason: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { member: { name: 'asc' } }],
    });
    const [payments, creditPayments] = await Promise.all([
      this.prisma.collectionPayment.findMany({
        where: {
          teamId,
          status: 'POSTED',
          transaction: {
            date: { gte: new Date(periodFrom), lte: new Date(`${periodTo}T23:59:59.999Z`) },
          },
        },
        include: {
          member: { select: { name: true } },
          plan: { select: { name: true } },
          transaction: { select: { date: true, paymentMethod: true } },
          allocations: { where: { releasedAt: null }, select: { amount: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.collectionPayment.findMany({
        where: { teamId, status: 'POSTED' },
        select: { amount: true, allocations: { where: { releasedAt: null }, select: { amount: true } } },
      }),
    ]);
    const obligationTotals = obligations.reduce((acc, item) => {
      if (item.status !== ObligationStatus.CANCELLED && item.status !== ObligationStatus.WAIVED) {
        acc.expected += Number(item.expectedAmount);
        acc.allocated += Number(item.allocatedAmount);
      }
      return acc;
    }, { expected: 0, allocated: 0 });
    const received = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const credit = creditPayments.reduce((acc, payment) => {
      const allocated = payment.allocations.reduce((sum, item) => sum + Number(item.amount), 0);
      return acc + Math.max(Number(payment.amount) - allocated, 0);
    }, 0);
    return {
      obligations,
      payments,
      totals: {
        ...obligationTotals,
        received,
        credit,
        pending: obligationTotals.expected - obligationTotals.allocated,
      },
    };
  }

  private today() {
    const value = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return new Date(`${value}T00:00:00.000Z`);
  }
}
