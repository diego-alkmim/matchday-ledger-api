import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(RolesGuard)
@ApiTags('Transactions')
@ApiBearerAuth('access-token')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Criar lançamento',
    description:
      'Cria um lançamento respeitando as regras de domínio: não permite jogo fechado, exige coerência entre tipo do lançamento e tipo da categoria, e exige diretor em entradas.',
  })
  @ApiBody({ type: CreateTransactionDto })
  @ApiResponse({
    status: 403,
    description:
      'Regras de domínio: não é permitido lançar em jogo fechado; categoria incompatível com o tipo do lançamento; entrada precisa estar vinculada a um diretor; diretor só lança entrada.',
  })
  async create(
    @Body() body: CreateTransactionDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualizar lançamento',
    description:
      'Atualiza um lançamento respeitando as regras de domínio: não permite jogo fechado, exige coerência entre tipo do lançamento e tipo da categoria e bloqueia troca de diretor em entrada já consolidada.',
  })
  @ApiBody({ type: UpdateTransactionDto })
  @ApiResponse({
    status: 403,
    description:
      'Regras de domínio: não é permitido lançar em jogo fechado; categoria incompatível com o tipo do lançamento; entrada precisa estar vinculada a um diretor; não é permitido trocar o diretor de uma entrada já consolidada.',
  })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateTransactionDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Excluir lançamento',
    description: 'Exclui um lançamento apenas quando ele pertence a jogo aberto.',
  })
  @ApiResponse({
    status: 403,
    description: 'Não é permitido excluir lançamento de jogo fechado.',
  })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
