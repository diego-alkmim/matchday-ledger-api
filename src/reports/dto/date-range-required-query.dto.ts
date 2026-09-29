import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class DateRangeRequiredQueryDto {
  @ApiProperty({ example: '2026-02-01' })
  @IsDateString()
  @Matches(DATE_ONLY_REGEX, {
    message: validationMessages.optionalDate('from'),
  })
  from!: string;

  @ApiProperty({ example: '2026-02-29' })
  @IsDateString()
  @Matches(DATE_ONLY_REGEX, {
    message: validationMessages.optionalDate('to'),
  })
  to!: string;
}
