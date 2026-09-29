import { Injectable } from '@nestjs/common';
import {
  CollectionFrequency,
  CollectionPaymentStatus,
  ContributionMode,
  MemberRole,
  ObligationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildContributionObligations,
  buildDirectorConsolidation,
  ContributionObligation,
  groupPaymentsByDirector,
} from './director-consolidation';
import { buildHistoricalDirectorEntries, historicalDirectorSelect } from './historical-directors';
import { isInCollectionRange } from './collection-report-range';
type DirectorReportEntry = ReturnType<typeof buildDirectorConsolidation>;
type ConsolidatedReport = {
  summary: {
    mode: ContributionMode | 'MIXED';
    gamesCount: number;
    obligationsCount: number;
    monthlyContributionPerDirector: number | null;
    expectedTotalPerDirector: number;
  };
  games: Array<{ id: string; date: Date; opponent: string | null; location: string | null }>;
  obligations: ContributionObligation[];
  directors: DirectorReportEntry[];
};
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
      select: { id: true, frequency: true, exclusiveGroup: true, effectiveFrom: true },
    });
    if (!plans.length) return null;
    const planIds = plans.map((plan) => plan.id);
    const planIdSet = new Set(planIds);

    const [obligations, payments] = await Promise.all([
      this.prisma.collectionObligation.findMany({
        where: {
          teamId,
          planId: { in: planIds },
          dueDate: dateFilter,
          status: { notIn: [ObligationStatus.CANCELLED, ObligationStatus.WAIVED] },
        },
        include: {
          member: { select: { id: true, name: true, contact: true, director: { select: { id: true } } } },
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
          OR: [
            {
              planId: { in: planIds },
              transaction: { date: dateFilter },
            },
            {
              allocations: {
                some: {
                  releasedAt: null,
                  obligation: { planId: { in: planIds }, dueDate: dateFilter },
                },
              },
            },
          ],
        },
        select: {
          memberId: true,
          planId: true,
          availableAmount: true,
          transaction: { select: { date: true } },
          allocations: {
            where: {
              releasedAt: null,
              obligation: { planId: { in: planIds }, dueDate: dateFilter },
            },
            select: { amount: true },
          },
        },
      }),
    ]);

    const paidByMember = new Map<string, number>();
    for (const payment of payments) {
      const allocatedToReport = payment.allocations
        .reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      const availableDirectorCredit = planIdSet.has(payment.planId) && isInCollectionRange(payment.transaction.date, from, to)
        ? Number(payment.availableAmount)
        : 0;
      paidByMember.set(
        payment.memberId,
        this.money((paidByMember.get(payment.memberId) ?? 0) + allocatedToReport + availableDirectorCredit),
      );
    }

    const byMember = new Map<string, typeof obligations>();
    for (const obligation of obligations) {
      const items = byMember.get(obligation.memberId) ?? [];
      items.push(obligation);
      byMember.set(obligation.memberId, items);
    }

    const directors: DirectorReportEntry[] = [...byMember.values()].map((items) => {
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
        director: { id: member.director?.id ?? member.id, name: member.name, contact: member.contact },
        totals: {
          obligationsCount: obligationStatuses.length,
          settledObligationsCount: obligationStatuses.length - missingObligations.length,
          expectedTotal,
          totalPaid,
          delta: this.money(totalPaid - expectedTotal),
        },
        status: missingObligations.length ? 'PENDENTE' as const : totalPaid > expectedTotal ? 'ACIMA' as const : 'EM_DIA' as const,
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
    const currentReport: ConsolidatedReport = {
      summary: {
        mode,
        gamesCount: games.length,
        obligationsCount: directors.reduce((sum, item) => sum + item.totals.obligationsCount, 0),
        monthlyContributionPerDirector: null,
        expectedTotalPerDirector: directors.length ? this.money(expectedTotal / directors.length) : 0,
      },
      games,
      obligations: uniqueObligations,
      directors,
    };
    const coverageFrom = plans.reduce(
      (earliest, plan) => plan.effectiveFrom < earliest ? plan.effectiveFrom : earliest,
      plans[0].effectiveFrom,
    );
    const legacyReport = await this.buildLegacy(teamId, from, to, coverageFrom);
    return legacyReport ? this.mergeReports(legacyReport, currentReport) : currentReport;
  }

  private async buildLegacy(teamId: string, from: string | undefined, to: string | undefined, coverageFrom: Date) {
    const requestedFrom = from ? new Date(`${from}T00:00:00.000-03:00`) : undefined;
    if (requestedFrom && requestedFrom >= coverageFrom) return null;
    const beforeCoverage = new Date(coverageFrom.getTime() - 1);
    const requestedTo = to ? new Date(`${to}T23:59:59.999-03:00`) : beforeCoverage;
    if (requestedFrom && requestedTo < requestedFrom) return null;

    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { contributionMode: true, monthlyContributionPerDirector: true },
    });
    const gameDate = this.legacyDateFilter(from, requestedTo, beforeCoverage, team.contributionMode);
    const [games, directors, payments] = await Promise.all([
      this.prisma.game.findMany({
        where: { teamId, date: gameDate },
        orderBy: { date: 'asc' },
        select: {
          id: true, date: true, opponent: true, location: true,
          expectedContributionPerDirector: true,
        },
      }),
      this.prisma.director.findMany({
        where: { teamId },
        orderBy: { name: 'asc' },
        select: historicalDirectorSelect,
      }),
      this.prisma.transaction.findMany({
        where: {
          teamId, reversedAt: null, type: 'ENTRADA', gameId: { not: null },
          category: { name: 'Diretoria' }, game: { date: gameDate },
        },
        include: {
          game: { select: { id: true, date: true, opponent: true, location: true } },
          category: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const monthlyAmount = Number(team.monthlyContributionPerDirector);
    const obligations = buildContributionObligations(games, team.contributionMode, monthlyAmount);
    const paymentsByDirector = groupPaymentsByDirector(directors, payments);
    const directorEntries = buildHistoricalDirectorEntries(
      directors,
      obligations,
      paymentsByDirector,
      team.contributionMode,
    );
    return {
      summary: {
        mode: team.contributionMode,
        gamesCount: games.length,
        obligationsCount: directorEntries.reduce((sum, item) => sum + item.totals.obligationsCount, 0),
        monthlyContributionPerDirector: team.contributionMode === ContributionMode.MONTHLY ? monthlyAmount : null,
        expectedTotalPerDirector: directorEntries.length
          ? this.money(directorEntries.reduce((sum, item) => sum + item.totals.expectedTotal, 0) / directorEntries.length)
          : 0,
      },
      games,
      obligations,
      directors: directorEntries,
    };
  }

  private legacyDateFilter(
    from: string | undefined,
    requestedTo: Date,
    beforeCoverage: Date,
    mode: ContributionMode,
  ) {
    let start = from ? new Date(`${from}T00:00:00.000-03:00`) : undefined;
    let end = requestedTo;
    if (mode === ContributionMode.MONTHLY) {
      if (from) start = new Date(`${from.slice(0, 7)}-01T00:00:00.000-03:00`);
      const reference = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(requestedTo);
      const [year, month] = reference.split('-').map(Number);
      end = new Date(Date.UTC(year, month, 1, 3) - 1);
    }
    if (end > beforeCoverage) end = beforeCoverage;
    return { ...(start ? { gte: start } : {}), lte: end };
  }

  private mergeReports(legacy: ConsolidatedReport, current: ConsolidatedReport): ConsolidatedReport {
    const directors = new Map<string, DirectorReportEntry>();
    for (const entry of [...legacy.directors, ...current.directors]) {
      const previous = directors.get(entry.director.id);
      if (!previous) {
        directors.set(entry.director.id, entry);
        continue;
      }
      const obligationStatuses = [...previous.obligationStatuses, ...entry.obligationStatuses];
      const missingObligations = obligationStatuses.filter((item) => item.missingAmount > 0);
      const expectedTotal = this.money(previous.totals.expectedTotal + entry.totals.expectedTotal);
      const totalPaid = this.money(previous.totals.totalPaid + entry.totals.totalPaid);
      directors.set(entry.director.id, {
        director: entry.director,
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
        payments: [...previous.payments, ...entry.payments],
      });
    }
    const mergedDirectors = [...directors.values()];
    const games = [...new Map([...legacy.games, ...current.games].map((game) => [game.id, game])).values()];
    const obligations = [...new Map(
      [...legacy.obligations, ...current.obligations].map((obligation) => [obligation.id, obligation]),
    ).values()];
    const expectedTotal = mergedDirectors.reduce((sum, item) => sum + item.totals.expectedTotal, 0);
    return {
      summary: {
        mode: legacy.summary.mode === current.summary.mode ? legacy.summary.mode : 'MIXED',
        gamesCount: games.length,
        obligationsCount: mergedDirectors.reduce((sum, item) => sum + item.totals.obligationsCount, 0),
        monthlyContributionPerDirector:
          legacy.summary.mode === current.summary.mode ? current.summary.monthlyContributionPerDirector : null,
        expectedTotalPerDirector: mergedDirectors.length
          ? this.money(expectedTotal / mergedDirectors.length)
          : 0,
      },
      games,
      obligations,
      directors: mergedDirectors,
    };
  }

  private mapObligation(item: {
    id: string;
    gameId: string | null;
    competence: Date | null;
    dueDate: Date;
    expectedAmount: { toString(): string };
    game: { id: string; opponent: string | null; location: string | null; date: Date } | null;
  }): ContributionObligation {
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
