import { ContributionMode } from '@prisma/client';

export type ReportGame = {
  id: string;
  date: Date;
  opponent: string | null;
  location: string | null;
  expectedContributionPerDirector: { toString(): string } | number;
};

export type ReportDirector = {
  id: string;
  name: string;
  contact: string | null;
};

type PaymentSource = {
  id: string;
  amount: { toString(): string } | number;
  createdAt: Date;
  date: Date;
  notes: string | null;
  paymentMethod: string;
  directorId: string | null;
  game: Omit<ReportGame, 'expectedContributionPerDirector'> | null;
  category: { name: string } | null;
};

export type DirectorPayment = Omit<PaymentSource, 'directorId' | 'amount' | 'category'> & {
  amount: number;
  category: string | null;
};

export type ContributionObligation = {
  id: string;
  type: 'GAME' | 'MONTH';
  date: Date;
  label: string;
  gameId: string | null;
  opponent: string | null;
  location: string | null;
  expectedAmount: number;
};

type DirectorObligationStatus = {
  obligation: ContributionObligation;
  expectedAmount: number;
  paidAmount: number;
  appliedOwnObligationAmount: number;
  appliedFromFutureExcess: number;
  appliedTotal: number;
  missingAmount: number;
  settled: boolean;
  coveredByFutureExcess: boolean;
  ownExcess: number;
};

const normalizeName = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
});
const monthReference = (date: Date) => {
  const parts = monthFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
};
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildContributionObligations(
  games: ReportGame[],
  mode: ContributionMode,
  monthlyContributionPerDirector: number,
): ContributionObligation[] {
  if (mode === ContributionMode.PER_GAME) {
    return games.map((game) => ({
      id: game.id,
      type: 'GAME',
      date: game.date,
      label: game.opponent || 'Sem adversário',
      gameId: game.id,
      opponent: game.opponent,
      location: game.location,
      expectedAmount: roundMoney(Number(game.expectedContributionPerDirector)),
    }));
  }

  const obligationsByMonth = new Map<string, ContributionObligation>();
  for (const game of games) {
    const reference = monthReference(game.date);
    if (obligationsByMonth.has(reference)) continue;
    const [year, month] = reference.split('-');
    obligationsByMonth.set(reference, {
      id: `month-${reference}`,
      type: 'MONTH',
      date: new Date(`${reference}-01T00:00:00.000Z`),
      label: `${month}/${year}`,
      gameId: null,
      opponent: null,
      location: null,
      expectedAmount: roundMoney(monthlyContributionPerDirector),
    });
  }
  return [...obligationsByMonth.values()];
}

export function groupPaymentsByDirector(
  directors: ReportDirector[],
  paymentsRaw: PaymentSource[],
): Map<string, DirectorPayment[]> {
  const paymentsByDirector = new Map<string, DirectorPayment[]>();
  const directorsByNormalizedName = new Map(
    directors.map((director) => [normalizeName(director.name), director.id]),
  );

  for (const payment of paymentsRaw) {
    const directorId =
      payment.directorId || directorsByNormalizedName.get(normalizeName(payment.notes));
    if (!directorId) continue;
    const payments = paymentsByDirector.get(directorId) ?? [];
    payments.push({
      id: payment.id,
      amount: roundMoney(Number(payment.amount)),
      createdAt: payment.createdAt,
      date: payment.date,
      notes: payment.notes,
      paymentMethod: payment.paymentMethod,
      game: payment.game,
      category: payment.category?.name ?? null,
    });
    paymentsByDirector.set(directorId, payments);
  }

  return paymentsByDirector;
}

function getPaymentObligationId(payment: DirectorPayment, mode: ContributionMode) {
  if (!payment.game) return null;
  return mode === ContributionMode.PER_GAME
    ? payment.game.id
    : `month-${monthReference(payment.game.date)}`;
}

export function buildDirectorConsolidation(
  director: ReportDirector,
  obligations: ContributionObligation[],
  payments: DirectorPayment[],
  mode: ContributionMode,
) {
  const expectedTotal = obligations.reduce(
    (sum, obligation) => roundMoney(sum + obligation.expectedAmount),
    0,
  );
  const totalPaid = payments.reduce((sum, payment) => roundMoney(sum + payment.amount), 0);
  const paymentsByObligation = new Map<string, number>();

  for (const payment of payments) {
    const obligationId = getPaymentObligationId(payment, mode);
    if (!obligationId) continue;
    paymentsByObligation.set(
      obligationId,
      roundMoney((paymentsByObligation.get(obligationId) ?? 0) + payment.amount),
    );
  }

  const obligationStatuses: DirectorObligationStatus[] = obligations.map((obligation) => {
    const paidAmount = paymentsByObligation.get(obligation.id) ?? 0;
    const appliedOwnObligationAmount = Math.min(paidAmount, obligation.expectedAmount);
    const missingAmount = roundMoney(
      Math.max(obligation.expectedAmount - appliedOwnObligationAmount, 0),
    );
    return {
      obligation,
      expectedAmount: obligation.expectedAmount,
      paidAmount,
      appliedOwnObligationAmount,
      appliedFromFutureExcess: 0,
      appliedTotal: appliedOwnObligationAmount,
      missingAmount,
      settled: missingAmount === 0,
      coveredByFutureExcess: false,
      ownExcess: roundMoney(Math.max(paidAmount - obligation.expectedAmount, 0)),
    };
  });

  for (let sourceIndex = 0; sourceIndex < obligationStatuses.length; sourceIndex += 1) {
    let excessRemaining = obligationStatuses[sourceIndex].ownExcess;
    for (let targetIndex = 0; targetIndex < sourceIndex && excessRemaining > 0; targetIndex += 1) {
      const target = obligationStatuses[targetIndex];
      if (target.missingAmount <= 0) continue;
      const appliedAmount = Math.min(excessRemaining, target.missingAmount);
      target.appliedFromFutureExcess = roundMoney(
        target.appliedFromFutureExcess + appliedAmount,
      );
      target.appliedTotal = roundMoney(target.appliedTotal + appliedAmount);
      target.missingAmount = roundMoney(target.missingAmount - appliedAmount);
      target.settled = target.missingAmount === 0;
      target.coveredByFutureExcess = target.appliedFromFutureExcess > 0;
      excessRemaining = roundMoney(excessRemaining - appliedAmount);
    }
  }

  const publicStatuses = obligationStatuses.map(({ ownExcess: _ownExcess, ...status }) => status);
  const missingObligations = publicStatuses.filter((status) => status.missingAmount > 0);
  const settledObligationsCount = obligationStatuses.filter((status) => status.settled).length;
  const delta = roundMoney(totalPaid - expectedTotal);

  return {
    director,
    totals: {
      obligationsCount: obligations.length,
      settledObligationsCount,
      expectedTotal,
      totalPaid,
      delta,
    },
    status: missingObligations.length ? 'PENDENTE' : delta > 0 ? 'ACIMA' : 'EM_DIA',
    obligationStatuses: publicStatuses,
    missingObligations,
    payments,
  };
}
