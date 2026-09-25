import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { validationMessages } from '../../common/validation/messages';
import { IsCuid } from '../../common/validation/cuid.validation';
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class AnalyticalByGameQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '2026-02-01' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, {
    message: validationMessages.optionalDate('from'),
  })
  from?: string;

  @ApiPropertyOptional({ example: '2026-02-29' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, {
    message: validationMessages.optionalDate('to'),
  })
  to?: string;

  @ApiPropertyOptional({ example: 'cuid-do-jogo' })
  @IsOptional()
  @IsCuid('gameId')
  gameId?: string;
}
