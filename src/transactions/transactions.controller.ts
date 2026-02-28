import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Delete,
  UseGuards,
} from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Role, TransactionType } from "@prisma/client";
import { RolesGuard } from "../common/guards/roles.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/user.decorator";
import { ApiBearerAuth, ApiTags, ApiBody } from "@nestjs/swagger";

@Controller("transactions")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("Transactions")
@ApiBearerAuth("access-token")
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get() list() {
    return this.service.list();
  }

  @Post()
  @ApiBody({
    schema: {
      type: "object",
      required: ["amount", "date", "paymentMethod", "gameId", "categoryId"],
      properties: {
        type: {
          type: "string",
          enum: ["ENTRADA", "SAIDA"],
          example: "ENTRADA",
        },
        amount: { type: "number", example: 70.0 },
        date: {
          type: "string",
          format: "date-time",
          example: "2026-02-22T00:00:00Z",
        },
        paymentMethod: {
          type: "string",
          enum: ["PIX", "DINHEIRO", "CARTAO"],
          example: "PIX",
        },
        notes: { type: "string", example: "Pagamento do diretor" },
        gameId: { type: "string", example: "game-id" },
        categoryId: { type: "string", example: "category-id" },
        directorId: { type: "string", nullable: true, example: "director-id" },
      },
    },
  })
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.service.create(body, user);
  }

  @Put(":id")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["ENTRADA", "SAIDA"] },
        amount: { type: "number" },
        date: { type: "string", format: "date-time" },
        paymentMethod: { type: "string", enum: ["PIX", "DINHEIRO", "CARTAO"] },
        notes: { type: "string" },
        gameId: { type: "string" },
        categoryId: { type: "string" },
        directorId: { type: "string", nullable: true },
      },
    },
  })
  async update(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
