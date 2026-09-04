import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GameStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class CreateGameDto {
  @ApiProperty({ example: '2026-02-22T14:00:00Z' })
  @IsDateString({}, { message: validationMessages.dateString('date') })
  date!: string;

  @ApiPropertyOptional({ example: 'Time X' })
  @IsOptional()
  @IsString({ message: validationMessages.string('opponent') })
  opponent?: string;

  @ApiPropertyOptional({ example: 'Arena Local' })
  @IsOptional()
  @IsString({ message: validationMessages.string('location') })
  location?: string;

  @ApiProperty({ enum: GameStatus, example: GameStatus.ABERTO })
  @IsEnum(GameStatus, {
    message: validationMessages.enum('status', Object.values(GameStatus)),
  })
  status!: GameStatus;
}
