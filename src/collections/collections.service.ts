import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CategoryType,
  MemberRole,
  ObligationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddPlanRateDto, CreateMemberDto, CreatePlanDto } from './dto/collections.dto';
import { CollectionsReconciliationService } from './collections-reconciliation.service';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { refreshUntouchedObligationsForRate } from './collection-rate-recalculation';
import { generateObligationsThroughToday } from './collections-generation-range';
import { collectionToday } from './collection-date';
import { findRoleAssignmentForEnd } from './collection-role-assignment';

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private reconciliation: CollectionsReconciliationService,
    private generation: CollectionsGenerationService,
    private ledger: CollectionsLedgerService,
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
    const now = collectionToday();
    return members.map((member) => ({
      ...member,
      active:
        member.activeFrom <= now &&
        member.roles.some((role) => role.startsAt <= now && (!role.endsAt || role.endsAt >= now)),
    }));
  }

  createMember(teamId: string, dto: CreateMemberDto) {
    return this.reconciliation.runSerializable(async (tx) => {
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
      await generateObligationsThroughToday(
        this.generation, this.ledger, tx, teamId, new Date(dto.activeFrom), collectionToday(),
      );
      return member;
    });
  }

  async deactivateMember(teamId: string, id: string, inactiveAt: string, actorId: string) {
    const date = new Date(inactiveAt);
    const today = collectionToday();
    return this.reconciliation.runSerializable(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id_teamId: { id, teamId } },
        include: { roles: true },
      });
      if (!member) throw new NotFoundException('Participante não encontrado.');
      if (date < member.activeFrom) {
        throw new BadRequestException('A data de inativação não pode ser anterior ao início do participante.');
      }
      const result = await Promise.all([
        tx.member.update({
          where: { id_teamId: { id, teamId } },
          data: { active: date >= today, inactiveAt: date },
        }),
        tx.memberRoleAssignment.updateMany({
          where: {
            teamId,
            memberId: id,
            startsAt: { lte: date },
            OR: [{ endsAt: null }, { endsAt: { gt: date } }],
          },
          data: { endsAt: date },
        }),
        tx.memberRoleAssignment.deleteMany({
          where: { teamId, memberId: id, startsAt: { gt: date } },
        }),
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
    const startDate = new Date(startsAt);
    const result = await this.reconciliation.runSerializable(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id_teamId: { id: memberId, teamId } },
        include: { roles: true, director: true },
      });
      if (!member) throw new NotFoundException('Participante não encontrado.');
      if (startDate < member.activeFrom) {
        throw new BadRequestException('A função não pode iniciar antes da entrada do participante.');
      }
      if (member.roles.some((item) => item.role === role && (!item.endsAt || item.endsAt >= startDate))) {
        throw new BadRequestException('Já existe um período igual ou sobreposto para esta função.');
      }
      await tx.member.update({ where: { id_teamId: { id: memberId, teamId } }, data: { active: true, inactiveAt: null } });
      const assignment = await tx.memberRoleAssignment.create({
        data: { teamId, memberId, role, startsAt: startDate },
      });
      if (role === MemberRole.DIRECTOR) {
        if (member.director) {
          await tx.director.update({ where: { id_teamId: { id: member.director.id, teamId } }, data: { active: true } });
        } else {
          await tx.director.create({ data: { teamId, memberId, name: member.name, contact: member.contact } });
        }
      }
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      await generateObligationsThroughToday(
        this.generation, this.ledger, tx, teamId, startDate, collectionToday(),
      );
      return assignment;
    });
    return result;
  }

  async endMemberRole(
    teamId: string,
    memberId: string,
    role: MemberRole,
    endsAt: string,
    actorId: string,
    assignmentId?: string,
  ) {
    const endDate = new Date(endsAt);
    const today = collectionToday();
    const result = await this.reconciliation.runSerializable(async (tx) => {
      const assignment = await findRoleAssignmentForEnd(
        tx, teamId, memberId, role, today, assignmentId,
      );
      if (!assignment) throw new NotFoundException('Função ativa não encontrada.');
      if (endDate < assignment.startsAt) {
        await tx.memberRoleAssignment.delete({ where: { id: assignment.id } });
      } else {
        await tx.memberRoleAssignment.update({
          where: { id: assignment.id },
          data: { endsAt: endDate },
        });
      }
      if (role === MemberRole.DIRECTOR) {
        const activeDirectorRoles = await tx.memberRoleAssignment.count({
          where: {
            teamId, memberId, role: MemberRole.DIRECTOR,
            startsAt: { lte: today },
            OR: [{ endsAt: null }, { endsAt: { gte: today } }],
          },
        });
        await tx.director.updateMany({
          where: { teamId, memberId },
          data: { active: activeDirectorRoles > 0 },
        });
      }
      const activeRoles = await tx.memberRoleAssignment.count({
        where: {
          teamId, memberId,
          startsAt: { lte: today },
          OR: [{ endsAt: null }, { endsAt: { gte: today } }],
        },
      });
      if (activeRoles === 0) {
        await tx.member.update({
          where: { id_teamId: { id: memberId, teamId } },
          data: { active: false, inactiveAt: endDate < assignment.startsAt ? today : endDate },
        });
      }
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      return { ...assignment, endsAt: endDate < assignment.startsAt ? null : endDate };
    });
    return result;
  }

  async listPlans(teamId: string) {
    const plans = await this.prisma.collectionPlan.findMany({
      where: { teamId },
      include: { category: true, rates: { orderBy: { effectiveFrom: 'desc' } } },
      orderBy: [{ active: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    });
    const now = collectionToday();
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
    return this.reconciliation.runSerializable(async (tx) => {
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
      await generateObligationsThroughToday(
        this.generation, this.ledger, tx, teamId, new Date(dto.effectiveFrom), collectionToday(),
      );
      return plan;
    });
  }

  async addRate(teamId: string, planId: string, dto: AddPlanRateDto) {
    const effectiveFrom = new Date(dto.effectiveFrom);
    return this.reconciliation.runSerializable(async (tx) => {
      const plan = await tx.collectionPlan.findUnique({
        where: { id_teamId: { id: planId, teamId } },
        include: { rates: true },
      });
      if (!plan) throw new NotFoundException('Plano não encontrado.');
      if (effectiveFrom < plan.effectiveFrom) {
        throw new BadRequestException('A vigência da tarifa não pode ser anterior ao início do plano.');
      }
      const rate = await tx.collectionPlanRate.create({
        data: { planId, amount: dto.amount, effectiveFrom },
      });
      await refreshUntouchedObligationsForRate(tx, teamId, plan, rate, this.ledger);
      await this.ledger.applyAvailableCreditsInTransaction(tx, teamId);
      return rate;
    });
  }

  async deactivatePlan(teamId: string, planId: string, inactiveAt: string, actorId: string) {
    const date = new Date(inactiveAt);
    const today = collectionToday();
    return this.reconciliation.runSerializable(async (tx) => {
      const currentPlan = await tx.collectionPlan.findUnique({ where: { id_teamId: { id: planId, teamId } } });
      if (!currentPlan) throw new NotFoundException('Plano não encontrado.');
      if (date < currentPlan.effectiveFrom) {
        throw new BadRequestException('A inativação não pode ser anterior ao início do plano.');
      }
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

}
