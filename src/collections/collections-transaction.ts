import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function runSerializable<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  failureMessage: string,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error(failureMessage);
}

export function payableObligations<T extends { gameId: string | null; dueDate: Date }>(
  obligations: T[],
  ownGameId?: string,
  ownGameDate?: Date,
) {
  const own = ownGameId ? obligations.find((obligation) => obligation.gameId === ownGameId) : undefined;
  const cutoff = own?.dueDate ?? ownGameDate;
  if (ownGameId && !cutoff) return [];
  const payable = cutoff ? obligations.filter((obligation) => obligation.dueDate <= cutoff) : obligations;
  return payable.sort((a, b) =>
    a.gameId === ownGameId ? -1 : b.gameId === ownGameId ? 1 : a.dueDate.getTime() - b.dueDate.getTime(),
  );
}
