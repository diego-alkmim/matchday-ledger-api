import { Body, Controller, Get, Post, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Categories')
@ApiBearerAuth('access-token')
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  // GET liberado para qualquer usuário autenticado
  @Get()
  list() { return this.service.list(); }

  // CRUD restrito a ADMIN
  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'type'],
      properties: {
        name: { type: 'string', example: 'Arbitragem' },
        type: { type: 'string', enum: ['ENTRADA', 'SAIDA'], example: 'SAIDA' },
        active: { type: 'boolean', example: true },
      },
    },
  })
  create(@Body() body: any) { return this.service.create(body); }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['ENTRADA', 'SAIDA'] },
        active: { type: 'boolean' },
      },
    },
  })
  update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
