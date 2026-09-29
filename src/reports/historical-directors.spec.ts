import { ContributionMode } from '@prisma/client';
import { ContributionObligation } from './director-consolidation';
import { buildHistoricalDirectorEntries } from './historical-directors';

describe('buildHistoricalDirectorEntries', () => {
  const obligations: ContributionObligation[] = [
    obligation('old-game', '2026-08-10'),
    obligation('current-game', '2026-09-20'),
  ];

  it('does not charge a new director for obligations before their role started', () => {
    const directors = [{
      id: 'director-1', memberId: 'member-1', name: 'Novo diretor', contact: null, active: true,
      member: { roles: [{ startsAt: new Date('2026-09-01'), endsAt: null }] },
    }];

    const result = buildHistoricalDirectorEntries(directors, obligations, new Map(), ContributionMode.PER_GAME);

    expect(result[0].totals).toMatchObject({ obligationsCount: 1, expectedTotal: 70 });
    expect(result[0].obligationStatuses[0].obligation.id).toBe('current-game');
  });

  it('uses the inferred role start for migrated directors whose IDs were reused', () => {
    const directors = [{
      id: 'director-1', memberId: 'director-1', name: 'Diretor legado', contact: null, active: true,
      member: { roles: [{ startsAt: new Date('2026-09-01'), endsAt: null }] },
    }];

    const result = buildHistoricalDirectorEntries(directors, obligations, new Map(), ContributionMode.PER_GAME);

    expect(result[0].totals).toMatchObject({ obligationsCount: 1, expectedTotal: 70 });
    expect(result[0].obligationStatuses[0].obligation.id).toBe('current-game');
  });
});

function obligation(id: string, date: string): ContributionObligation {
  return {
    id, type: 'GAME', date: new Date(date), label: id, gameId: id,
    opponent: id, location: null, expectedAmount: 70,
  };
}
