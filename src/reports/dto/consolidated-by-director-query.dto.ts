import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';
import { DateRangeQueryDto } from './date-range-query.dto';

export class ConsolidatedByDirectorQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: validationMessages.number('expectedPerGame') })
  @Min(0, { message: 'expectedPerGame deve ser maior ou igual a zero' })
  expectedPerGame?: number;
}
