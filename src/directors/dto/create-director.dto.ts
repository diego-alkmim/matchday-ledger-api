import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { validationMessages } from '../../common/validation/messages';

export class CreateDirectorDto {
  @ApiProperty({ example: 'Tiaguinho' })
  @IsString({ message: validationMessages.string('name') })
  @IsNotEmpty({ message: validationMessages.required('name') })
  name!: string;

  @ApiPropertyOptional({ example: '11999990000' })
  @IsOptional()
  @IsString({ message: validationMessages.string('contact') })
  contact?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean({ message: validationMessages.boolean('active') })
  active?: boolean;
}
