import { ContributionMode } from '@prisma/client';
import {
  buildContributionObligations,
  buildDirectorConsolidation,
  ReportGame,
} from './director-consolidation';

const director = { id: 'director-1', name: 'Diretor', contact: null };
const games: ReportGame[] = [
  {
    id: 'game-1',
    date: new Date('2026-01-10T12:00:00.000Z'),
    opponent: 'Time A',
    location: null,
    expectedContributionPerDirector: 70,
  },
  {
    id: 'game-2',
    date: new Date('2026-01-20T12:00:00.000Z'),
    opponent: 'Time B',
    location: null,
    expectedContributionPerDirector: 90,
  },
  {
    id: 'game-3',
    date: new Date('2026-02-10T12:00:00.000Z'),
    opponent: 'Time C',
    location: null,
    expectedContributionPerDirector: 100,
  },
];

describe('director contribution consolidation', () => {
  it('uses the expected amount stored in each game', () => {
    const obligations = buildContributionObligations(games, ContributionMode.PER_GAME, 300);
    const result = buildDirectorConsolidation(director, obligations, [], ContributionMode.PER_GAME);

    expect(obligations.map((item) => item.expectedAmount)).toEqual([70, 90, 100]);
    expect(result.totals.expectedTotal).toBe(260);
    expect(result.missingObligations).toHaveLength(3);
  });

  it('creates one monthly obligation for each month containing games', () => {
    const obligations = buildContributionObligations(games, ContributionMode.MONTHLY, 250);
    const result = buildDirectorConsolidation(director, obligations, [], ContributionMode.MONTHLY);

    expect(obligations.map((item) => item.label)).toEqual(['01/2026', '02/2026']);
    expect(result.totals.obligationsCount).toBe(2);
    expect(result.totals.expectedTotal).toBe(500);
  });

  it('groups late-night games by the Brazilian local calendar month', () => {
    const lateNightGame: ReportGame = {
      ...games[0],
      id: 'late-game',
      date: new Date('2026-02-01T02:00:00.000Z'),
    };

    const obligations = buildContributionObligations(
      [lateNightGame],
      ContributionMode.MONTHLY,
      250,
    );

    expect(obligations[0].label).toBe('01/2026');
  });

  it('combines payments from different games in the same monthly obligation', () => {
    const obligations = buildContributionObligations(games, ContributionMode.MONTHLY, 250);
    const payments = games.slice(0, 2).map((game, index) => ({
      id: `payment-${index}`,
      amount: index === 0 ? 100 : 150,
      createdAt: game.date,
      date: game.date,
      notes: null,
      paymentMethod: 'PIX',
      game,
      category: 'Diretoria',
    }));
    const result = buildDirectorConsolidation(
      director,
      obligations,
      payments,
      ContributionMode.MONTHLY,
    );

    expect(result.obligationStatuses[0].paidAmount).toBe(250);
    expect(result.obligationStatuses[0].settled).toBe(true);
    expect(result.missingObligations).toHaveLength(1);
  });

  it('applies excess from a later obligation to the oldest pending obligation', () => {
    const obligations = buildContributionObligations(games, ContributionMode.PER_GAME, 300);
    const payments = [
      {
        id: 'payment-1',
        amount: 250,
        createdAt: new Date('2026-02-10T12:00:00.000Z'),
        date: new Date('2026-02-10T12:00:00.000Z'),
        notes: null,
        paymentMethod: 'PIX',
        game: games[2],
        category: 'Diretoria',
      },
    ];
    const result = buildDirectorConsolidation(
      director,
      obligations,
      payments,
      ContributionMode.PER_GAME,
    );

    expect(result.obligationStatuses[0].missingAmount).toBe(0);
    expect(result.obligationStatuses[1].missingAmount).toBe(10);
    expect(result.obligationStatuses[2].missingAmount).toBe(0);
  });
});
