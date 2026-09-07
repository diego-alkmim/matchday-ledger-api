import { ForbiddenException, Injectable } from '@nestjs/common';
import { CategoryType, GameStatus, Role, TransactionType } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { domainErrors } from '../common/errors/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  private normalizeDate(input: string | Date | undefined): Date | undefined {
    if (!input) return undefined;
    if (input instanceof Date) return input;

    const iso = input.includes('T') ? input : `${input}T00:00:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private assertGameOpen(status: GameStatus) {
    if (status === GameStatus.FECHADO) {
      throw new ForbiddenException(domainErrors.closedGameTransaction);
    }
  }

  private assertCategoryMatchesType(
    categoryType: CategoryType,
    transactionType: TransactionType,
  ) {
    if (categoryType !== transactionType) {
      throw new ForbiddenException(domainErrors.categoryTypeMismatch);
    }
  }

  list() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        paymentMethod: true,
        notes: true,
        gameId: true,
        categoryId: true,
        directorId: true,
        createdAt: true,
        game: { select: { id: true, date: true, opponent: true } },
        category: { select: { id: true, name: true, type: true } },
        director: { select: { id: true, name: true } },
      },
    });
  }

  async create(data: CreateTransactionDto, user: AccessTokenPayload) {
    const [game, category] = await Promise.all([
      this.prisma.game.findUnique({ where: { id: data.gameId } }),
      this.prisma.category.findUnique({ where: { id: data.categoryId } }),
    ]);

    if (!game) throw new ForbiddenException(domainErrors.gameNotFound);
    if (!category) throw new ForbiddenException(domainErrors.categoryNotFound);

    this.assertGameOpen(game.status);
    this.assertCategoryMatchesType(category.type, data.type);

    const parsedDate = this.normalizeDate(data.date);
    if (!parsedDate) throw new ForbiddenException(domainErrors.invalidDate);

    const payload = {
      ...data,
      date: parsedDate,
      createdByUserId: user.sub,
      directorId: data.directorId ?? null,
    };

    if (user.role === Role.DIRETOR) {
      if (payload.type !== TransactionType.ENTRADA) {
        throw new ForbiddenException(domainErrors.directorOnlyEntry);
      }
      payload.directorId = user.directorId;
    }

    if (payload.type === TransactionType.ENTRADA && !payload.directorId) {
      throw new ForbiddenException(domainErrors.entryRequiresDirector);
    }

    return this.prisma.transaction.create({ data: payload });
  }

  async update(id: string, data: UpdateTransactionDto, user: AccessTokenPayload) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { game: true, category: true },
    });

    if (!transaction) {
      throw new ForbiddenException(domainErrors.transactionNotFound);
    }

    const targetGameId = data.gameId ?? transaction.gameId;
    const targetCategoryId = data.categoryId ?? transaction.categoryId;
    const nextType = (data.type ?? transaction.type) as TransactionType;

    const [targetGame, targetCategory] = await Promise.all([
      targetGameId === transaction.gameId
        ? Promise.resolve(transaction.game)
        : this.prisma.game.findUnique({ where: { id: targetGameId } }),
      targetCategoryId === transaction.categoryId
        ? Promise.resolve(transaction.category)
        : this.prisma.category.findUnique({ where: { id: targetCategoryId } }),
    ]);

    if (!targetGame) throw new ForbiddenException(domainErrors.gameNotFound);
    if (!targetCategory) {
      throw new ForbiddenException(domainErrors.categoryNotFound);
    }

    this.assertGameOpen(targetGame.status);
    this.assertCategoryMatchesType(targetCategory.type, nextType);

    if (user.role === Role.DIRETOR && transaction.type !== TransactionType.ENTRADA) {
      throw new ForbiddenException(domainErrors.directorOnlyEntry);
    }

    const nextDirectorId = data.directorId ?? transaction.directorId;

    if (
      transaction.type === TransactionType.ENTRADA &&
      transaction.directorId &&
      nextDirectorId !== transaction.directorId
    ) {
      throw new ForbiddenException(domainErrors.consolidatedEntryDirectorChange);
    }

    if (nextType === TransactionType.ENTRADA && !nextDirectorId) {
      throw new ForbiddenException(domainErrors.entryRequiresDirector);
    }

    const parsedDate = data.date ? this.normalizeDate(data.date) : undefined;
    if (data.date && !parsedDate) {
      throw new ForbiddenException(domainErrors.invalidDate);
    }

    const payload = {
      ...data,
      ...(parsedDate ? { date: parsedDate } : {}),
      ...(nextType === TransactionType.ENTRADA ? { directorId: nextDirectorId } : {}),
    };

    if (user.role === Role.DIRETOR) {
      payload.directorId = user.directorId;
    }

    return this.prisma.transaction.update({ where: { id }, data: payload });
  }

  async remove(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { game: true },
    });

    if (!transaction) {
      throw new ForbiddenException(domainErrors.transactionNotFound);
    }

    this.assertGameOpen(transaction.game.status);

    return this.prisma.transaction.delete({ where: { id } });
  }
}
