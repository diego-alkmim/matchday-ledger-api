import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GameStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
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

  @ApiProperty({
    example: 70,
    minimum: 0.01,
    description: 'Valor esperado deste jogo para cada diretor no modo por jogo.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: validationMessages.number('expectedContributionPerDirector') })
  @Min(0.01, { message: validationMessages.positive('expectedContributionPerDirector') })
  expectedContributionPerDirector!: number;
}
