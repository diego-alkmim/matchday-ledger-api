import {
  CollectionFrequency,
  CollectionPaymentStatus,
  ObligationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsDirectorReportService } from './collections-director-report.service';
import { CollectionsGenerationService } from '../collections/collections-generation.service';
import { CollectionsLedgerService } from '../collections/collections-ledger.service';

describe('CollectionsDirectorReportService', () => {
  const planFindMany = jest.fn();
  const obligationFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const teamFindUniqueOrThrow = jest.fn();
  const gameFindMany = jest.fn();
  const directorFindMany = jest.fn();
  const transactionFindMany = jest.fn();
  const prisma = {
    collectionPlan: { findMany: planFindMany },
    collectionObligation: { findMany: obligationFindMany },
    collectionPayment: { findMany: paymentFindMany },
    team: { findUniqueOrThrow: teamFindUniqueOrThrow },
    game: { findMany: gameFindMany },
    director: { findMany: directorFindMany },
    transaction: { findMany: transactionFindMany },
  } as unknown as PrismaService;
  const generation = { generate: jest.fn() } as unknown as CollectionsGenerationService;
  const ledger = { applyAvailableCredits: jest.fn() } as unknown as CollectionsLedgerService;
  const service = new CollectionsDirectorReportService(prisma, generation, ledger);

  beforeEach(() => {
    jest.clearAllMocks();
    (generation.generate as jest.Mock).mockResolvedValue({ created: 0 });
  });

  it('uses monthly collection obligations and payments without requiring a game', async () => {
    planFindMany.mockResolvedValue([{
      id: 'plan-1', frequency: CollectionFrequency.MONTHLY, exclusiveGroup: 'membership',
      effectiveFrom: new Date('2026-09-01'),
    }]);
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', memberId: 'member-1', gameId: null,
      competence: new Date('2026-09-01'), dueDate: new Date('2026-09-20'),
      expectedAmount: new Prisma.Decimal(100), status: ObligationStatus.PAID,
      member: { id: 'member-1', name: 'Diretor', contact: null, director: { id: 'director-1' } }, game: null,
      allocations: [{ amount: new Prisma.Decimal(100) }],
    }]);
    paymentFindMany.mockResolvedValue([{
      memberId: 'member-1', planId: 'plan-1', amount: new Prisma.Decimal(100),
      status: CollectionPaymentStatus.POSTED, transaction: { date: new Date('2026-09-20') },
      allocations: [{
        amount: new Prisma.Decimal(100),
        obligation: { planId: 'plan-1', dueDate: new Date('2026-09-20') },
      }],
    }]);

    const result = await service.build('team-1', '2026-09-01', '2026-09-30');

    expect(result?.summary.mode).toBe('MONTHLY');
    expect(result?.directors[0]).toMatchObject({
      status: 'EM_DIA',
      totals: { expectedTotal: 100, totalPaid: 100, delta: 0 },
      missingObligations: [],
    });
    expect(paymentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.any(Array),
      }),
    }));
    expect(generation.generate).toHaveBeenCalledWith('team-1', '2026-09-01', '2026-09-30');
  });

  it('merges legacy history before the first collection plan', async () => {
    planFindMany.mockResolvedValue([{
      id: 'plan-1', frequency: CollectionFrequency.PER_GAME, exclusiveGroup: 'membership',
      effectiveFrom: new Date('2026-09-01'),
    }]);
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', memberId: 'member-1', gameId: 'game-current', competence: null,
      dueDate: new Date('2026-09-10'), expectedAmount: new Prisma.Decimal(70),
      status: ObligationStatus.PAID,
      member: { id: 'member-1', name: 'Diretor', contact: null, director: { id: 'director-1' } },
      game: { id: 'game-current', opponent: 'Atual', location: null, date: new Date('2026-09-10') },
      allocations: [{ amount: new Prisma.Decimal(70) }],
    }]);
    paymentFindMany.mockResolvedValue([{
      memberId: 'member-1', planId: 'plan-1', amount: new Prisma.Decimal(70),
      transaction: { date: new Date('2026-09-10') },
      allocations: [{
        amount: new Prisma.Decimal(70),
        obligation: { planId: 'plan-1', dueDate: new Date('2026-09-10') },
      }],
    }]);
    teamFindUniqueOrThrow.mockResolvedValue({
      contributionMode: 'PER_GAME', monthlyContributionPerDirector: new Prisma.Decimal(70),
    });
    gameFindMany.mockResolvedValue([{
      id: 'game-legacy', date: new Date('2026-08-10'), opponent: 'Antigo', location: null,
      expectedContributionPerDirector: new Prisma.Decimal(70),
    }]);
    directorFindMany.mockResolvedValue([{
      id: 'director-1', memberId: 'director-1', name: 'Diretor', contact: null, active: true,
      member: { roles: [] },
    }]);
    transactionFindMany.mockResolvedValue([{
      id: 'transaction-1', amount: new Prisma.Decimal(70), createdAt: new Date('2026-08-10'),
      date: new Date('2026-08-10'), notes: null, paymentMethod: 'PIX', directorId: 'director-1',
      game: { id: 'game-legacy', date: new Date('2026-08-10'), opponent: 'Antigo', location: null },
      category: { name: 'Diretoria' },
    }]);

    const result = await service.build('team-1', '2026-08-01', '2026-09-30');

    expect(result?.directors[0].totals).toMatchObject({
      obligationsCount: 2, settledObligationsCount: 2, expectedTotal: 140, totalPaid: 140,
    });
    expect(result?.games).toHaveLength(2);
  });

  it('applies available credits only when report generation creates obligations', async () => {
    planFindMany.mockResolvedValue([{
      id: 'plan-1', frequency: CollectionFrequency.MONTHLY, exclusiveGroup: 'membership',
      effectiveFrom: new Date('2026-09-01'),
    }]);
    obligationFindMany.mockResolvedValue([]);
    paymentFindMany.mockResolvedValue([]);
    (generation.generate as jest.Mock).mockResolvedValue({ created: 1 });

    await service.build('team-1', '2026-09-01', '2026-09-30');

    expect(ledger.applyAvailableCredits).toHaveBeenCalledWith('team-1');
  });

  it('counts a payment from another plan when it was allocated to a director obligation', async () => {
    planFindMany.mockResolvedValue([{
      id: 'director-plan', frequency: CollectionFrequency.MONTHLY, exclusiveGroup: 'membership',
      effectiveFrom: new Date('2026-09-01'),
    }]);
    obligationFindMany.mockResolvedValue([{
      id: 'obligation-1', memberId: 'member-1', gameId: null,
      competence: new Date('2026-09-01'), dueDate: new Date('2026-09-20'),
      expectedAmount: new Prisma.Decimal(100), status: ObligationStatus.PAID,
      member: { id: 'member-1', name: 'Diretor', contact: null, director: { id: 'director-1' } },
      game: null, allocations: [{ amount: new Prisma.Decimal(100) }],
    }]);
    paymentFindMany.mockResolvedValue([{
      memberId: 'member-1', planId: 'player-plan', amount: new Prisma.Decimal(100),
      transaction: { date: new Date('2026-10-05') },
      allocations: [{
        amount: new Prisma.Decimal(100),
        obligation: { planId: 'director-plan', dueDate: new Date('2026-09-20') },
      }],
    }]);

    const result = await service.build('team-1', '2026-09-01', '2026-09-30');

    expect(result?.directors[0]).toMatchObject({
      status: 'EM_DIA', totals: { expectedTotal: 100, totalPaid: 100, delta: 0 },
    });
  });
});
