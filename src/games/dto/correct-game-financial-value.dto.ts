import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class CorrectGameFinancialValueDto {
  @ApiProperty({
    example: 100,
    minimum: 0.01,
    description: 'Novo valor esperado por diretor para o jogo.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: validationMessages.number('expectedContributionPerDirector') })
  @Min(0.01, { message: validationMessages.positive('expectedContributionPerDirector') })
  expectedContributionPerDirector!: number;

  @ApiProperty({
    example: 'O valor correto aprovado para a partida era R$ 100,00.',
    maxLength: 500,
    description: 'Justificativa obrigatória registrada na trilha de auditoria.',
  })
  @IsString({ message: validationMessages.string('reason') })
  @Matches(/\S/, { message: 'reason não pode estar vazio' })
  @MaxLength(500, { message: 'reason deve ter no máximo 500 caracteres' })
  reason!: string;
}
