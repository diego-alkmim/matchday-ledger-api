import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GameStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class CreateGameDto {
  @ApiProperty({ example: '2026-02-22T14:00:00Z' })
  @IsDateString({}, { message: validationMessages.dateString('date') })
  date!: string;

  @ApiPropertyOptional({ example: 'Time X' })
  @IsOptional()
  @IsString({ message: validationMessages.string('opponent') })
  @MaxLength(160, { message: 'opponent deve ter no máximo 160 caracteres' })
  opponent?: string;

  @ApiPropertyOptional({ example: 'Arena Local' })
  @IsOptional()
  @IsString({ message: validationMessages.string('location') })
  @MaxLength(160, { message: 'location deve ter no máximo 160 caracteres' })
  location?: string;

  @ApiProperty({ enum: GameStatus, example: GameStatus.ABERTO })
  @IsEnum(GameStatus, {
    message: validationMessages.enum('status', Object.values(GameStatus)),
  })
  status!: GameStatus;
}
