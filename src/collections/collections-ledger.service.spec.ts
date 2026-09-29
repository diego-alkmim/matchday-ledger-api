import {
  AdjustmentType,
  CollectionFrequency,
  CollectionPaymentStatus,
  GameStatus,
  MemberRole,
  ObligationStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsLedgerService } from './collections-ledger.service';
import { AUTOMATIC_CANCELLATION_REASON } from './collections.constants';

describe('CollectionsLedgerService', () => {
  const paymentFindUnique = jest.fn();
  const paymentUpdate = jest.fn();
  const paymentFindMany = jest.fn();
  const transactionUpdate = jest.fn();
  const transactionCreate = jest.fn();
  const paymentCreate = jest.fn();
  const obligationFindUnique = jest.fn();
  const obligationFindUniqueOrThrow = jest.fn();
  const obligationFindMany = jest.fn();
  const obligationUpdate = jest.fn();
  const adjustmentCreate = jest.fn();
  const adjustmentFindUnique = jest.fn();
  const adjustmentUpdate = jest.fn();
  const allocationUpdateMany = jest.fn();
  const allocationUpsert = jest.fn();
  const allocationUpdate = jest.fn();
  const memberFindUnique = jest.fn();
  const planFindUnique = jest.fn();
  const planFindFirst = jest.fn();
  const gameFindUnique = jest.fn();
  const tx = {
    collectionPayment: { findUnique: paymentFindUnique, findMany: paymentFindMany, update: paymentUpdate, create: paymentCreate },
    transaction: { update: transactionUpdate, create: transactionCreate },
    collectionObligation: { findUnique: obligationFindUnique, findUniqueOrThrow: obligationFindUniqueOrThrow, findMany: obligationFindMany, update: obligationUpdate },
    collectionAdjustment: { create: adjustmentCreate, findUnique: adjustmentFindUnique, update: adjustmentUpdate },
    collectionAllocation: { updateMany: allocationUpdateMany, upsert: allocationUpsert, update: allocationUpdate },
    member: { findUnique: memberFindUnique },
    collectionPlan: { findUnique: planFindUnique, findFirst: planFindFirst },
    game: { findUnique: gameFindUnique },
    director: { findFirst: jest.fn() },
  };
  const prisma = {
    member: { findUnique: memberFindUnique },
    collectionPlan: { findUnique: planFindUnique, findFirst: planFindFirst },
    game: { findUnique: gameFindUnique },
    $transaction: jest.fn((callback) => callback(tx)),
  } as unknown as PrismaService;
  const service = new CollectionsLedgerService(prisma);
  const user = { sub: 'user-1', teamId: 'team-1', role: Role.ADMIN } as AccessTokenPayload;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentFindMany.mockResolvedValue([]);
    paymentFindUnique.mockResolvedValue(null);
  });

  it('requires a game for a per-game payment', async () => {
    memberFindUnique.mockResolvedValue({ id: 'member-1', roles: [] });
    planFindUnique.mockResolvedValue({ id: 'plan-1', frequency: CollectionFrequency.PER_GAME });

    await expect(service.createPayment({
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      memberId: 'member-1', planId: 'plan-1', amount: 70, date: '2026-09-20', paymentMethod: 'PIX',
    }, user)).rejects.toThrow('Selecione o jogo referente ao pagamento.');
  });

  it('rejects a payment linked to a closed game', async () => {
    memberFindUnique.mockResolvedValue({ id: 'member-1', roles: [] });
    planFindUnique.mockResolvedValue({ id: 'plan-1', frequency: CollectionFrequency.PER_GAME });
    gameFindUnique.mockResolvedValue({ id: 'game-1', status: GameStatus.FECHADO });

    await expect(service.createPayment({
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      memberId: 'member-1', planId: 'plan-1', gameId: 'game-1', amount: 70,
      date: '2026-09-20', paymentMethod: 'PIX',
    }, user)).rejects.toThrow('Não é permitido registrar pagamento em jogo fechado.');
  });

  it('returns an existing payment for the same idempotency key', async () => {
    const existing = {
      id: 'payment-1', memberId: 'member-1', planId: 'plan-1', amount: new Prisma.Decimal(70),
      transaction: {
        date: new Date('2026-09-20'), gameId: null, paymentMethod: 'PIX', notes: null,
      },
      allocations: [],
    };
    paymentFindUnique.mockResolvedValue(existing);

    await expect(service.createPayment({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      memberId: 'member-1', planId: 'plan-1', amount: 70, date: '2026-09-20', paymentMethod: 'PIX',
    }, user)).resolves.toBe(existing);

    expect(memberFindUnique).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with different payment data', async () => {
    paymentFindUnique.mockResolvedValue({
      id: 'payment-1', memberId: 'member-1', planId: 'plan-1', amount: new Prisma.Decimal(70),
      transaction: { date: new Date('2026-09-20'), gameId: null, paymentMethod: 'PIX', notes: null },
      allocations: [],
    });

    await expect(service.createPayment({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      memberId: 'member-1', planId: 'plan-1', amount: 100, date: '2026-09-20', paymentMethod: 'PIX',
    }, user)).rejects.toThrow('A chave de idempotência já foi usada em outro pagamento.');
  });

  it('generates a server idempotency key for an older client request', async () => {
    const result = { id: 'payment-1', transaction: {}, allocations: [] };
    paymentFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(result);
    memberFindUnique.mockResolvedValue({
      id: 'member-1', roles: [{ role: MemberRole.PLAYER, startsAt: new Date('2026-01-01'), endsAt: null }],
    });
    planFindUnique.mockResolvedValue({
      id: 'plan-1', audienceRole: MemberRole.PLAYER, frequency: CollectionFrequency.MONTHLY,
      exclusiveGroup: 'membership', priority: 50, categoryId: 'category-1',
      effectiveFrom: new Date('2026-01-01'), inactiveAt: null,
    });
    planFindFirst.mockResolvedValue(null);
    transactionCreate.mockResolvedValue({ id: 'transaction-1' });
    paymentCreate.mockResolvedValue({ id: 'payment-1' });
    obligationFindMany.mockResolvedValue([]);

    await expect(service.createPayment({
      memberId: 'member-1', planId: 'plan-1', amount: 70, date: '2026-09-20', paymentMethod: 'PIX',
    }, user)).resolves.toBe(result);

    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ idempotencyKey: expect.any(String) }),
    });
  });

  it('reverses the payment and transaction while preserving allocation history', async () => {
    paymentFindUnique.mockResolvedValue({
      id: 'payment-1', teamId: 'team-1', transactionId: 'transaction-1',
      status: CollectionPaymentStatus.POSTED,
      allocations: [{ obligationId: 'obligation-1', amount: new Prisma.Decimal(70) }],
    });
    obligationFindUniqueOrThrow.mockResolvedValue({
      id: 'obligation-1', originalAmount: new Prisma.Decimal(70),
      adjustments: [], allocations: [{ amount: new Prisma.Decimal(70), payment: { status: CollectionPaymentStatus.REVERSED } }],
    });

    await expect(service.reversePayment('payment-1', 'Lançamento duplicado', user)).resolves.toEqual({ reversed: true });

    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: CollectionPaymentStatus.REVERSED, reversalReason: 'Lançamento duplicado' }) }));
    expect(transactionUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reversalReason: 'Lançamento duplicado' }) }));
    expect(obligationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ allocatedAmount: new Prisma.Decimal(0), status: ObligationStatus.OPEN }) }));
  });

  it('releases allocations when an obligation is waived', async () => {
    obligationFindUnique.mockResolvedValue({
      id: 'obligation-1', teamId: 'team-1', status: ObligationStatus.PAID, _count: { allocations: 1 },
    });
    obligationFindUniqueOrThrow.mockResolvedValue({
      id: 'obligation-1', originalAmount: new Prisma.Decimal(70),
      adjustments: [{ type: AdjustmentType.WAIVER, amount: new Prisma.Decimal(0) }], allocations: [],
    });
    obligationUpdate.mockResolvedValue({ id: 'obligation-1', status: ObligationStatus.WAIVED });

    await service.adjustObligation(
      'obligation-1',
      { type: AdjustmentType.WAIVER, reason: 'Isenção aprovada' },
      user,
    );

    expect(allocationUpdateMany).toHaveBeenCalledWith({
      where: { obligationId: 'obligation-1', releasedAt: null },
      data: { releasedAt: expect.any(Date), releaseReason: 'Isenção aprovada' },
    });
    expect(obligationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ expectedAmount: 0, allocatedAmount: 0, status: ObligationStatus.WAIVED }),
    }));
  });

  it('allocates a payment only inside the selected exclusive group', async () => {
    obligationFindMany.mockResolvedValue([]);

    await (service as unknown as {
      allocatePayment: (
        transaction: typeof tx,
        paymentId: string,
        memberId: string,
        group: string,
        amount: number,
      ) => Promise<void>;
    }).allocatePayment(tx, 'payment-1', 'member-1', 'membership', 70);

    expect(obligationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        memberId: 'member-1',
        plan: { exclusiveGroup: 'membership' },
      }),
    }));
  });

  it('does not use per-game excess to settle a future game', async () => {
    obligationFindMany.mockResolvedValue([
      { id: 'own', gameId: 'game-1', dueDate: new Date('2026-09-10'), expectedAmount: new Prisma.Decimal(70), allocatedAmount: new Prisma.Decimal(0) },
      { id: 'future', gameId: 'game-2', dueDate: new Date('2026-09-20'), expectedAmount: new Prisma.Decimal(70), allocatedAmount: new Prisma.Decimal(0) },
    ]);
    obligationFindUniqueOrThrow.mockResolvedValue({
      id: 'own', originalAmount: new Prisma.Decimal(70), adjustments: [], allocations: [],
    });

    await (service as unknown as {
      allocatePayment: (
        transaction: typeof tx,
        paymentId: string,
        memberId: string,
        group: string,
        amount: number,
        ownGameId: string,
      ) => Promise<void>;
    }).allocatePayment(tx, 'payment-1', 'member-1', 'membership', 140, 'game-1');

    expect(allocationUpsert).toHaveBeenCalledTimes(1);
    expect(allocationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ obligationId: 'own' }),
    }));
  });

  it('reverses an adjustment and reopens the obligation', async () => {
    adjustmentFindUnique.mockResolvedValue({
      id: 'adjustment-1',
      reversedAt: null,
      obligation: { id: 'obligation-1', teamId: 'team-1' },
    });
    obligationFindUniqueOrThrow.mockResolvedValue({
      id: 'obligation-1', originalAmount: new Prisma.Decimal(70), adjustments: [], allocations: [],
    });
    obligationUpdate.mockResolvedValue({ id: 'obligation-1', status: ObligationStatus.OPEN });

    await service.reverseAdjustment('adjustment-1', 'Correção administrativa', user);

    expect(adjustmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'adjustment-1' },
      data: expect.objectContaining({ reversalReason: 'Correção administrativa' }),
    }));
    expect(obligationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ObligationStatus.OPEN }),
    }));
  });

  it('does not allow an automatic cancellation to be manually reversed', async () => {
    adjustmentFindUnique.mockResolvedValue({
      id: 'adjustment-1', reversedAt: null, type: AdjustmentType.CANCELLATION,
      reason: AUTOMATIC_CANCELLATION_REASON,
      obligation: { id: 'obligation-1', teamId: 'team-1' },
    });

    await expect(service.reverseAdjustment('adjustment-1', 'Reabrir', user))
      .rejects.toThrow('Cancelamentos automáticos não podem ser desfeitos manualmente.');
    expect(adjustmentUpdate).not.toHaveBeenCalled();
  });

  it('returns over-allocation to credit when a surcharge is reversed', async () => {
    adjustmentFindUnique.mockResolvedValue({
      id: 'adjustment-1', reversedAt: null,
      obligation: { id: 'obligation-1', teamId: 'team-1' },
    });
    obligationFindUniqueOrThrow.mockResolvedValue({
      id: 'obligation-1', originalAmount: new Prisma.Decimal(70), adjustments: [],
      allocations: [{
        id: 'allocation-1', amount: new Prisma.Decimal(100), createdAt: new Date(),
        payment: { status: CollectionPaymentStatus.POSTED },
      }],
    });
    obligationUpdate.mockResolvedValue({ id: 'obligation-1', status: ObligationStatus.PAID });

    await service.reverseAdjustment('adjustment-1', 'Acréscimo incorreto', user);

    expect(allocationUpdate).toHaveBeenCalledWith({
      where: { id: 'allocation-1' },
      data: { amount: new Prisma.Decimal(70) },
    });
    expect(obligationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ allocatedAmount: new Prisma.Decimal(70) }),
    }));
  });
});
