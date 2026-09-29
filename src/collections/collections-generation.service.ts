import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CollectionFrequency,
  CollectionPlan,
  CollectionPlanRate,
  MemberRoleAssignment,
  Prisma,
  ProrationPolicy,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PlanWithRates = CollectionPlan & { rates: CollectionPlanRate[] };

@Injectable()
export class CollectionsGenerationService {
  constructor(private prisma: PrismaService) {}

  async generate(teamId: string, fromInput: string, toInput: string, maxDays?: number) {
    return this.generateWithClient(this.prisma, teamId, fromInput, toInput, maxDays);
  }

  async generateInTransaction(
    tx: Prisma.TransactionClient,
    teamId: string,
    fromInput: string,
    toInput: string,
    memberId?: string,
  ) {
    return this.generateWithClient(tx, teamId, fromInput, toInput, undefined, memberId);
  }

  private async generateWithClient(
    client: Prisma.TransactionClient,
    teamId: string,
    fromInput: string,
    toInput: string,
    maxDays?: number,
    memberId?: string,
  ) {
    const from = this.dateOnly(fromInput);
    const to = this.dateOnly(toInput);
    if (from > to) throw new BadRequestException('O período informado é inválido.');
    const periodDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (maxDays && periodDays > maxDays) {
      throw new BadRequestException(`O período máximo permitido é de ${maxDays} dias.`);
    }

    const [plans, members, games] = await Promise.all([
      client.collectionPlan.findMany({
        where: { teamId, effectiveFrom: { lte: to }, OR: [{ inactiveAt: null }, { inactiveAt: { gte: from } }] },
        include: { rates: { orderBy: { effectiveFrom: 'asc' } } },
        orderBy: { priority: 'desc' },
      }),
      client.member.findMany({
        where: { teamId, activeFrom: { lte: to }, ...(memberId ? { id: memberId } : {}) },
        include: { roles: true },
      }),
      client.game.findMany({ where: { teamId, date: { gte: from, lte: this.endOfDay(to) } }, orderBy: { date: 'asc' } }),
    ]);

    const obligations: Prisma.CollectionObligationCreateManyInput[] = [];
    for (const member of members) {
      for (const plan of plans) {
        if (plan.frequency === CollectionFrequency.MONTHLY) {
          obligations.push(...this.buildMonthly(plan, plans, member.id, member.roles, from, to));
        } else {
          obligations.push(...this.buildPerGame(plan, plans, member.id, member.roles, games));
        }
      }
    }
    if (!obligations.length) return { created: 0 };
    const existing = await client.collectionObligation.findMany({
      where: {
        teamId,
        ...(memberId ? { memberId } : {}),
        OR: [
          { competence: { gte: this.monthStart(from), lte: this.monthStart(to) } },
          ...(games.length ? [{ gameId: { in: games.map((game) => game.id) } }] : []),
        ],
      },
      select: { planId: true, memberId: true, competence: true, gameId: true },
    });
    const existingKeys = new Set(existing.map((item) => this.obligationKey(item)));
    const pending = obligations.filter((item) => !existingKeys.has(this.obligationKey(item)));
    if (!pending.length) return { created: 0 };
    const result = await client.collectionObligation.createMany({ data: pending, skipDuplicates: true });
    return { created: result.count };
  }

  private buildMonthly(plan: PlanWithRates, plans: PlanWithRates[], memberId: string, roles: MemberRoleAssignment[], from: Date, to: Date) {
    const obligations: Prisma.CollectionObligationCreateManyInput[] = [];
    for (const competence of this.monthsBetween(from, to)) {
      const dueDate = new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth(), plan.dueDay ?? 20));
      const referenceDate = plan.prorationPolicy === ProrationPolicy.FULL_AMOUNT
        ? new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth() + 1, 0))
        : plan.prorationPolicy === ProrationPolicy.NEXT_MONTH
          ? new Date(competence.getTime() - 1)
          : dueDate;
      if (!this.planWinsAt(plan, plans, roles, referenceDate)) continue;
      const rate = this.rateAt(plan.rates, referenceDate);
      if (!rate) continue;
      obligations.push({
        teamId: plan.teamId, planId: plan.id, memberId, competence, dueDate,
        roleSnapshot: plan.audienceRole, originalAmount: rate.amount, expectedAmount: rate.amount,
      });
    }
    return obligations;
  }

  private buildPerGame(
    plan: PlanWithRates,
    plans: PlanWithRates[],
    memberId: string,
    roles: MemberRoleAssignment[],
    games: Array<{ id: string; date: Date; expectedContributionPerDirector: Prisma.Decimal }>,
  ) {
    const obligations: Prisma.CollectionObligationCreateManyInput[] = [];
    for (const game of games) {
      if (!this.planWinsAt(plan, plans, roles, game.date)) continue;
      const rate = this.rateAt(plan.rates, game.date);
      const amount = plan.audienceRole === 'DIRECTOR' ? game.expectedContributionPerDirector : rate?.amount;
      if (!amount) continue;
      obligations.push({
        teamId: plan.teamId, planId: plan.id, memberId, gameId: game.id, dueDate: game.date,
        roleSnapshot: plan.audienceRole, originalAmount: amount, expectedAmount: amount,
      });
    }
    return obligations;
  }

  private planWinsAt(plan: PlanWithRates, plans: PlanWithRates[], roles: MemberRoleAssignment[], date: Date) {
    if (!this.hasRole(roles, plan.audienceRole, date) || !this.planActive(plan, date)) return false;
    return !plans.some((candidate) =>
      candidate.id !== plan.id &&
      candidate.exclusiveGroup === plan.exclusiveGroup &&
      (candidate.priority > plan.priority || (candidate.priority === plan.priority && candidate.id < plan.id)) &&
      this.planActive(candidate, date) &&
      this.hasRole(roles, candidate.audienceRole, date),
    );
  }

  private hasRole(roles: MemberRoleAssignment[], role: MemberRoleAssignment['role'], date: Date) {
    return roles.some((assignment) => assignment.role === role && assignment.startsAt <= date && (!assignment.endsAt || assignment.endsAt >= date));
  }

  private planActive(plan: CollectionPlan, date: Date) {
    return plan.effectiveFrom <= date && (!plan.inactiveAt || plan.inactiveAt >= date);
  }

  private rateAt(rates: CollectionPlanRate[], date: Date) {
    return [...rates].reverse().find((rate) => rate.effectiveFrom <= date);
  }

  private monthsBetween(from: Date, to: Date) {
    const months: Date[] = [];
    let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (cursor <= to) {
      months.push(cursor);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return months;
  }

  private monthStart(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  }

  private obligationKey(item: { planId: string; memberId: string; competence?: Date | string | null; gameId?: string | null }) {
    const competence = item.competence ? new Date(item.competence).toISOString().slice(0, 10) : '';
    return `${item.planId}:${item.memberId}:${item.gameId ?? competence}`;
  }

  private dateOnly(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  private endOfDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
  }
}
