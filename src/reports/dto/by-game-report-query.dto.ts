import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class ByGameReportQueryDto {
  @ApiProperty({ example: 'cuid-do-jogo' })
  @IsString({ message: validationMessages.string('gameId') })
  @IsNotEmpty({ message: validationMessages.required('gameId') })
  gameId!: string;
}
