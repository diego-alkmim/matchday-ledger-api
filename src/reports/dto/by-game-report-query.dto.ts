import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';
import { IsCuid } from '../../common/validation/cuid.validation';

export class ByGameReportQueryDto {
  @ApiProperty({ example: 'cuid-do-jogo' })
  @IsString({ message: validationMessages.string('gameId') })
  @IsNotEmpty({ message: validationMessages.required('gameId') })
  @IsCuid('gameId')
  gameId!: string;
}
