import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { IsEnum, IsOptional, Matches } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { IsCuid } from '../../common/validation/cuid.validation';
import { validationMessages } from '../../common/validation/messages';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class ListTransactionsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'cuid-do-jogo' })
  @IsOptional()
  @IsCuid('gameId')
  gameId?: string;

  @ApiPropertyOptional({ example: 'cuid-da-categoria' })
  @IsOptional()
  @IsCuid('categoryId')
  categoryId?: string;

  @ApiPropertyOptional({ example: 'cuid-do-diretor' })
  @IsOptional()
  @IsCuid('directorId')
  directorId?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType, { message: validationMessages.enum('type', Object.values(TransactionType)) })
  type?: TransactionType;

  @ApiPropertyOptional({ example: '2026-02-01' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: validationMessages.optionalDate('from') })
  from?: string;

  @ApiPropertyOptional({ example: '2026-02-28' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: validationMessages.optionalDate('to') })
  to?: string;
}
