import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContributionMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDefined, IsEnum, IsNumber, Min, ValidateIf } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class UpdateContributionSettingsDto {
  @ApiProperty({ enum: ContributionMode, example: ContributionMode.PER_GAME })
  @IsEnum(ContributionMode, {
    message: validationMessages.enum('mode', Object.values(ContributionMode)),
  })
  mode!: ContributionMode;

  @ApiPropertyOptional({
    example: 280,
    minimum: 0.01,
    description: 'Obrigatório quando o modo escolhido for mensal.',
  })
  @ValidateIf(
    (dto: UpdateContributionSettingsDto, value: unknown) =>
      dto.mode === ContributionMode.MONTHLY || value !== undefined,
  )
  @IsDefined({ message: validationMessages.required('monthlyContributionPerDirector') })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: validationMessages.number('monthlyContributionPerDirector') },
  )
  @Min(0.01, { message: validationMessages.positive('monthlyContributionPerDirector') })
  monthlyContributionPerDirector?: number;
}
