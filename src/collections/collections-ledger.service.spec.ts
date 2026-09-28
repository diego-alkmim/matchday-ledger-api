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
  const obligationUpdate = jest.fn();
  const adjustmentCreate = jest.fn();
  const allocationUpdateMany = jest.fn();
  const tx = {
    collectionPayment: { findUnique: paymentFindUnique, findMany: paymentFindMany, update: paymentUpdate },
    transaction: { update: transactionUpdate },
    collectionObligation: { findUnique: obligationFindUnique, findUniqueOrThrow: obligationFindUniqueOrThrow, update: obligationUpdate },
    collectionAdjustment: { create: adjustmentCreate },
    collectionAllocation: { updateMany: allocationUpdateMany },
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
});
