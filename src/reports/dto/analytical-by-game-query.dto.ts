import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';
import { DateRangeQueryDto } from './date-range-query.dto';

export class AnalyticalByGameQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ example: 'cuid-do-jogo' })
  @IsOptional()
  @IsString({ message: validationMessages.string('gameId') })
  gameId?: string;
}
