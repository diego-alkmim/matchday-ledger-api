import { AdjustmentType, CollectionPaymentStatus, ObligationStatus, Prisma, Role } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsLedgerService } from './collections-ledger.service';

describe('CollectionsLedgerService', () => {
  const paymentFindUnique = jest.fn();
  const paymentUpdate = jest.fn();
  const paymentFindMany = jest.fn();
  const transactionUpdate = jest.fn();
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
  const tx = {
    collectionPayment: { findUnique: paymentFindUnique, findMany: paymentFindMany, update: paymentUpdate },
    transaction: { update: transactionUpdate },
    collectionObligation: { findUnique: obligationFindUnique, findUniqueOrThrow: obligationFindUniqueOrThrow, findMany: obligationFindMany, update: obligationUpdate },
    collectionAdjustment: { create: adjustmentCreate, findUnique: adjustmentFindUnique, update: adjustmentUpdate },
    collectionAllocation: { updateMany: allocationUpdateMany, upsert: allocationUpsert, update: allocationUpdate },
  };
  const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as unknown as PrismaService;
  const service = new CollectionsLedgerService(prisma);
  const user = { sub: 'user-1', teamId: 'team-1', role: Role.ADMIN } as AccessTokenPayload;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentFindMany.mockResolvedValue([]);
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
