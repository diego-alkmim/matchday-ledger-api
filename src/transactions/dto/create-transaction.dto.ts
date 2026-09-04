import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentMethod, TransactionType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { validationMessages } from "../../common/validation/messages";

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.ENTRADA })
  @IsEnum(TransactionType, {
    message: validationMessages.enum("type", Object.values(TransactionType)),
  })
  type!: TransactionType;

  @ApiProperty({ example: 70 })
  @Type(() => Number)
  @IsNumber({}, { message: validationMessages.number("amount") })
  @Min(0.01, { message: validationMessages.positive("amount") })
  amount!: number;

  @ApiProperty({ example: "2026-02-22T00:00:00Z" })
  @IsDateString({}, { message: validationMessages.dateString("date") })
  date!: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.PIX })
  @IsEnum(PaymentMethod, {
    message: validationMessages.enum(
      "paymentMethod",
      Object.values(PaymentMethod),
    ),
  })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ example: "Pagamento do diretor" })
  @IsOptional()
  @IsString({ message: validationMessages.string("notes") })
  notes?: string;

  @ApiProperty({ example: "game-id" })
  @IsString({ message: validationMessages.string("gameId") })
  @IsNotEmpty({ message: validationMessages.required("gameId") })
  gameId!: string;

  @ApiProperty({ example: "category-id" })
  @IsString({ message: validationMessages.string("categoryId") })
  @IsNotEmpty({ message: validationMessages.required("categoryId") })
  categoryId!: string;

  @ApiPropertyOptional({ example: "director-id", nullable: true })
  @IsOptional()
  @IsString({ message: validationMessages.string("directorId") })
  @IsNotEmpty({ message: validationMessages.required("directorId") })
  directorId?: string | null;
}
