import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdjustmentType,
  CollectionFrequency,
  MemberRole,
  PaymentMethod,
  ProrationPolicy,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCuid } from '../../common/validation/cuid.validation';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateMemberDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsDateString() activeFrom!: string;
  @IsArray() @ArrayMinSize(1) @IsEnum(MemberRole, { each: true }) roles!: MemberRole[];
}

export class CreatePlanDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsEnum(MemberRole) audienceRole!: MemberRole;
  @IsEnum(CollectionFrequency) frequency!: CollectionFrequency;
  @IsString() @IsCuid('categoryId') categoryId!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @Type(() => Number) @IsInt() @Min(0) priority = 0;
  @IsOptional() @IsString() @MaxLength(60) exclusiveGroup = 'membership';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(28) dueDay?: number;
  @IsEnum(ProrationPolicy) prorationPolicy = ProrationPolicy.DUE_DATE_CUTOFF;
  @IsDateString() effectiveFrom!: string;
}

export class AddPlanRateDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() effectiveFrom!: string;
}

export class GenerateObligationsDto {
  @IsDateString() @Matches(DATE_ONLY_REGEX) from!: string;
  @IsDateString() @Matches(DATE_ONLY_REGEX) to!: string;
}

export class CreateCollectionPaymentDto {
  @IsOptional() @IsUUID() idempotencyKey?: string;
  @IsString() @IsCuid('memberId') memberId!: string;
  @IsString() @IsCuid('planId') planId!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() date!: string;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsString() @IsCuid('gameId') gameId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ReversePaymentDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class AdjustObligationDto {
  @ApiProperty({ enum: AdjustmentType })
  @IsEnum(AdjustmentType) type!: AdjustmentType;

  @ApiPropertyOptional({ description: 'Obrigatório para desconto e acréscimo.' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) amount?: number;

  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class CollectionPeriodQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() @Matches(DATE_ONLY_REGEX) from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() @Matches(DATE_ONLY_REGEX) to?: string;
}

export class EffectiveDateDto {
  @IsDateString() date!: string;
}

export class ChangeMemberRoleDto extends EffectiveDateDto {
  @IsEnum(MemberRole) role!: MemberRole;
  @IsOptional() @IsString() @IsCuid('assignmentId') assignmentId?: string;
}
