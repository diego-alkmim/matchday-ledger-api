import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { TransactionType, PaymentMethod } from '@prisma/client';
import { ParseCuidPipe } from '../pipes/parse-cuid.pipe';
import { CreateTransactionDto } from '../../transactions/dto/create-transaction.dto';

const validCuid = 'c123456789012345678901234';

describe('CUID validation', () => {
  it('accepts a valid CUID route parameter', () => {
    expect(new ParseCuidPipe().transform(validCuid)).toBe(validCuid);
  });

  it('rejects malformed CUID route parameters', () => {
    expect(() => new ParseCuidPipe().transform('not-an-id')).toThrow(BadRequestException);
  });

  it('rejects malformed related IDs and oversized transaction notes', async () => {
    const dto = Object.assign(new CreateTransactionDto(), {
      type: TransactionType.ENTRADA,
      amount: 70,
      date: '2026-09-06T00:00:00.000Z',
      paymentMethod: PaymentMethod.PIX,
      gameId: 'invalid-id',
      categoryId: validCuid,
      directorId: validCuid,
      notes: 'a'.repeat(1001),
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['gameId', 'notes']),
    );
  });
});
