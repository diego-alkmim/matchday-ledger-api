import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Arbitragem' })
  @IsString({ message: validationMessages.string('name') })
  @IsNotEmpty({ message: validationMessages.required('name') })
  @MaxLength(120, { message: 'name deve ter no máximo 120 caracteres' })
  name!: string;

  @ApiProperty({ enum: CategoryType, example: CategoryType.SAIDA })
  @IsEnum(CategoryType, {
    message: validationMessages.enum('type', Object.values(CategoryType)),
  })
  type!: CategoryType;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean({ message: validationMessages.boolean('active') })
  active?: boolean;
}
