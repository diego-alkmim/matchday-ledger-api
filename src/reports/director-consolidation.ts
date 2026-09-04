export type ReportGame = {
  id: string;
  date: Date;
  opponent: string | null;
  location: string | null;
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
  game: ReportGame | null;
  category: { name: string } | null;
};

export type DirectorPayment = Omit<PaymentSource, "directorId" | "amount" | "category"> & {
  amount: number;
  category: string | null;
};

type DirectorGameStatus = {
  game: ReportGame;
  expectedAmount: number;
  paidAmount: number;
  appliedOwnGameAmount: number;
  appliedFromFutureExcess: number;
  appliedTotal: number;
  missingAmount: number;
  settled: boolean;
  coveredByFutureExcess: boolean;
  ownExcess: number;
};

const normalizeName = (value?: string | null) =>
  (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function groupPaymentsByDirector(
  directors: ReportDirector[],
  paymentsRaw: PaymentSource[],
): Map<string, DirectorPayment[]> {
  const paymentsByDirector = new Map<string, DirectorPayment[]>();
  const directorsByNormalizedName = new Map(directors.map((director) => [normalizeName(director.name), director.id]));

  for (const payment of paymentsRaw) {
    const directorId = payment.directorId || directorsByNormalizedName.get(normalizeName(payment.notes));
    if (!directorId) continue;
    const payments = paymentsByDirector.get(directorId) ?? [];
    payments.push({
      id: payment.id,
      amount: Number(payment.amount),
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

export function buildDirectorConsolidation(
  director: ReportDirector,
  games: ReportGame[],
  payments: DirectorPayment[],
  expectedPerGame: number,
) {
  const expectedTotal = games.length * expectedPerGame;
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const paymentsByGame = new Map<string, number>();

  for (const payment of payments) {
    if (!payment.game) continue;
    paymentsByGame.set(payment.game.id, (paymentsByGame.get(payment.game.id) ?? 0) + payment.amount);
  }

  const gameStatuses: DirectorGameStatus[] = games.map((game) => {
    const paidAmount = paymentsByGame.get(game.id) ?? 0;
    const appliedOwnGameAmount = Math.min(paidAmount, expectedPerGame);
    const missingAmount = Math.max(expectedPerGame - appliedOwnGameAmount, 0);
    return {
      game,
      expectedAmount: expectedPerGame,
      paidAmount,
      appliedOwnGameAmount,
      appliedFromFutureExcess: 0,
      appliedTotal: appliedOwnGameAmount,
      missingAmount,
      settled: missingAmount === 0,
      coveredByFutureExcess: false,
      ownExcess: Math.max(paidAmount - expectedPerGame, 0),
    };
  });

  for (let sourceIndex = 0; sourceIndex < gameStatuses.length; sourceIndex += 1) {
    let excessRemaining = gameStatuses[sourceIndex].ownExcess;
    for (let targetIndex = 0; targetIndex < sourceIndex && excessRemaining > 0; targetIndex += 1) {
      const target = gameStatuses[targetIndex];
      if (target.missingAmount <= 0) continue;
      const appliedAmount = Math.min(excessRemaining, target.missingAmount);
      target.appliedFromFutureExcess += appliedAmount;
      target.appliedTotal += appliedAmount;
      target.missingAmount -= appliedAmount;
      target.settled = target.missingAmount === 0;
      target.coveredByFutureExcess = target.appliedFromFutureExcess > 0;
      excessRemaining -= appliedAmount;
    }
  }

  const missingGames = gameStatuses.filter((gameStatus) => gameStatus.missingAmount > 0);
  const paidGamesCount = gameStatuses.filter((gameStatus) => gameStatus.settled).length;
  const delta = totalPaid - expectedTotal;

  return {
    director,
    totals: { gamesCount: games.length, paidGamesCount, expectedPerGame, expectedTotal, totalPaid, delta },
    status: missingGames.length ? "PENDENTE" : delta > 0 ? "ACIMA" : "EM_DIA",
    gameStatuses: gameStatuses.map(({ ownExcess: _ownExcess, ...gameStatus }) => gameStatus),
    missingGames,
    payments,
  };
}

