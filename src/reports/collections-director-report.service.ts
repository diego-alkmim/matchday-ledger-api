import { Injectable } from '@nestjs/common';
import {
  CollectionFrequency,
  CollectionPaymentStatus,
  MemberRole,
  ObligationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollectionsDirectorReportService {
  constructor(private prisma: PrismaService) {}

  async build(teamId: string, from?: string, to?: string) {
    const dateFilter = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
    const plans = await this.prisma.collectionPlan.findMany({
      where: {
        teamId,
        audienceRole: MemberRole.DIRECTOR,
        ...(to ? { effectiveFrom: { lte: new Date(to) } } : {}),
        ...(from ? { OR: [{ inactiveAt: null }, { inactiveAt: { gte: new Date(from) } }] } : {}),
      },
      select: { id: true, frequency: true, exclusiveGroup: true },
    });
    if (!plans.length) return null;

    const [obligations, payments] = await Promise.all([
      this.prisma.collectionObligation.findMany({
        where: {
          teamId,
          planId: { in: plans.map((plan) => plan.id) },
          dueDate: dateFilter,
          status: { notIn: [ObligationStatus.CANCELLED, ObligationStatus.WAIVED] },
        },
        include: {
          member: { select: { id: true, name: true, contact: true } },
          game: { select: { id: true, opponent: true, location: true, date: true } },
          allocations: {
            where: { releasedAt: null, payment: { status: CollectionPaymentStatus.POSTED } },
            select: { amount: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.collectionPayment.findMany({
        where: {
          teamId,
          status: CollectionPaymentStatus.POSTED,
          plan: { exclusiveGroup: { in: [...new Set(plans.map((plan) => plan.exclusiveGroup))] } },
          ...(from || to ? { transaction: { date: dateFilter } } : {}),
        },
        select: { memberId: true, amount: true },
      }),
    ]);

    const paidByMember = new Map<string, number>();
    for (const payment of payments) {
      paidByMember.set(
        payment.memberId,
        this.money((paidByMember.get(payment.memberId) ?? 0) + Number(payment.amount)),
      );
    }

    const byMember = new Map<string, typeof obligations>();
    for (const obligation of obligations) {
      const items = byMember.get(obligation.memberId) ?? [];
      items.push(obligation);
      byMember.set(obligation.memberId, items);
    }

    const directors = [...byMember.values()].map((items) => {
      const member = items[0].member;
      const obligationStatuses = items.map((item) => {
        const applied = this.money(item.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0));
        const expected = Number(item.expectedAmount);
        const missing = this.money(Math.max(expected - applied, 0));
        return {
          obligation: this.mapObligation(item),
          expectedAmount: expected,
          paidAmount: applied,
          appliedOwnObligationAmount: applied,
          appliedFromFutureExcess: 0,
          appliedTotal: applied,
          missingAmount: missing,
          settled: missing === 0,
          coveredByFutureExcess: false,
        };
      });
      const expectedTotal = this.money(obligationStatuses.reduce((sum, item) => sum + item.expectedAmount, 0));
      const totalPaid = paidByMember.get(member.id) ?? 0;
      const missingObligations = obligationStatuses.filter((item) => item.missingAmount > 0);
      return {
        director: member,
        totals: {
          obligationsCount: obligationStatuses.length,
          settledObligationsCount: obligationStatuses.length - missingObligations.length,
          expectedTotal,
          totalPaid,
          delta: this.money(totalPaid - expectedTotal),
        },
        status: missingObligations.length ? 'PENDENTE' : totalPaid > expectedTotal ? 'ACIMA' : 'EM_DIA',
        obligationStatuses,
        missingObligations,
        payments: [],
      };
    });
    const uniqueObligations = [...new Map(obligations.map((item) => [item.id, this.mapObligation(item)])).values()];
    const frequencies = new Set(plans.map((plan) => plan.frequency));
    const mode = frequencies.size > 1
      ? 'MIXED'
      : plans[0].frequency === CollectionFrequency.PER_GAME ? 'PER_GAME' : 'MONTHLY';
    const games = [...new Map(obligations.filter((item) => item.game).map((item) => [item.game!.id, item.game!])).values()];
    const expectedTotal = directors.reduce((sum, item) => sum + item.totals.expectedTotal, 0);
    return {
      summary: {
        mode,
        gamesCount: games.length,
        obligationsCount: uniqueObligations.length,
        monthlyContributionPerDirector: null,
        expectedTotalPerDirector: directors.length ? this.money(expectedTotal / directors.length) : 0,
      },
      games,
      obligations: uniqueObligations,
      directors,
    };
  }

  private mapObligation(item: {
    id: string;
    gameId: string | null;
    competence: Date | null;
    dueDate: Date;
    expectedAmount: { toString(): string };
    game: { id: string; opponent: string | null; location: string | null; date: Date } | null;
  }) {
    return {
      id: item.id,
      type: item.gameId ? 'GAME' : 'MONTH',
      date: item.game?.date ?? item.competence ?? item.dueDate,
      label: item.game?.opponent ?? this.monthLabel(item.competence ?? item.dueDate),
      gameId: item.gameId,
      opponent: item.game?.opponent ?? null,
      location: item.game?.location ?? null,
      expectedAmount: Number(item.expectedAmount),
    };
  }

  private monthLabel(date: Date) {
    return new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
