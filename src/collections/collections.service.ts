import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType, MemberRole, ObligationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddPlanRateDto, CreateMemberDto, CreatePlanDto } from './dto/collections.dto';

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  listMembers(teamId: string) {
    return this.prisma.member.findMany({
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

  async deactivateMember(teamId: string, id: string, inactiveAt: string) {
    const date = new Date(inactiveAt);
    const member = await this.prisma.member.findUnique({ where: { id_teamId: { id, teamId } } });
    if (!member) throw new NotFoundException('Participante não encontrado.');
    return this.prisma.$transaction([
      this.prisma.member.update({ where: { id_teamId: { id, teamId } }, data: { active: false, inactiveAt: date } }),
      this.prisma.memberRoleAssignment.updateMany({ where: { teamId, memberId: id, endsAt: null }, data: { endsAt: date } }),
      this.prisma.director.updateMany({ where: { teamId, memberId: id }, data: { active: false } }),
    ]);
  }

  async addMemberRole(teamId: string, memberId: string, role: MemberRole, startsAt: string) {
    return this.prisma.$transaction(async (tx) => {
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
      return assignment;
    });
  }

  async endMemberRole(teamId: string, memberId: string, role: MemberRole, endsAt: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.memberRoleAssignment.updateMany({
        where: { teamId, memberId, role, endsAt: null },
        data: { endsAt: new Date(endsAt) },
      });
      if (result.count === 0) throw new NotFoundException('Função ativa não encontrada.');
      if (role === MemberRole.DIRECTOR) {
        await tx.director.updateMany({ where: { teamId, memberId }, data: { active: false } });
      }
      const activeRoles = await tx.memberRoleAssignment.count({ where: { teamId, memberId, endsAt: null } });
      if (activeRoles === 0) {
        await tx.member.update({ where: { id_teamId: { id: memberId, teamId } }, data: { active: false, inactiveAt: new Date(endsAt) } });
      }
      return result;
    });
  }

  listPlans(teamId: string) {
    return this.prisma.collectionPlan.findMany({
      where: { teamId },
      include: { category: true, rates: { orderBy: { effectiveFrom: 'desc' } } },
      orderBy: [{ active: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    });
  }

  async createPlan(teamId: string, dto: CreatePlanDto) {
    const category = await this.prisma.category.findUnique({ where: { id_teamId: { id: dto.categoryId, teamId } } });
    if (!category || category.type !== CategoryType.ENTRADA) {
      throw new BadRequestException('Selecione uma categoria de entrada do time.');
    }
    if (dto.frequency === 'MONTHLY' && !dto.dueDay) {
      throw new BadRequestException('Informe o dia de vencimento do plano mensal.');
    }
    return this.prisma.collectionPlan.create({
      data: {
        teamId, name: dto.name.trim(), audienceRole: dto.audienceRole, frequency: dto.frequency,
        categoryId: dto.categoryId, priority: dto.priority, exclusiveGroup: dto.exclusiveGroup,
        dueDay: dto.frequency === 'MONTHLY' ? dto.dueDay : null,
        prorationPolicy: dto.prorationPolicy, effectiveFrom: new Date(dto.effectiveFrom),
        rates: { create: { amount: dto.amount, effectiveFrom: new Date(dto.effectiveFrom) } },
      },
      include: { rates: true, category: true },
    });
  }

  async addRate(teamId: string, planId: string, dto: AddPlanRateDto) {
    const plan = await this.prisma.collectionPlan.findUnique({ where: { id_teamId: { id: planId, teamId } } });
    if (!plan) throw new NotFoundException('Plano não encontrado.');
    return this.prisma.collectionPlanRate.create({ data: { planId, amount: dto.amount, effectiveFrom: new Date(dto.effectiveFrom) } });
  }

  async deactivatePlan(teamId: string, planId: string, inactiveAt: string) {
    return this.prisma.collectionPlan.update({
      where: { id_teamId: { id: planId, teamId } },
      data: { active: false, inactiveAt: new Date(inactiveAt) },
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
}
