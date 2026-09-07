import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class CreateDirectorDto {
  @ApiProperty({ example: 'Tiaguinho' })
  @IsString({ message: validationMessages.string('name') })
  @IsNotEmpty({ message: validationMessages.required('name') })
  @MaxLength(120, { message: 'name deve ter no máximo 120 caracteres' })
  name!: string;

  @ApiPropertyOptional({ example: '11999990000' })
  @IsOptional()
  @IsString({ message: validationMessages.string('contact') })
  @MaxLength(80, { message: 'contact deve ter no máximo 80 caracteres' })
  contact?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean({ message: validationMessages.boolean('active') })
  active?: boolean;
}
