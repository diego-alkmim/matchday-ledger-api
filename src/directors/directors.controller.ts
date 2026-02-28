import { Body, Controller, Get, Post, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { DirectorsService } from './directors.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';

@Controller('directors')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Directors')
@ApiBearerAuth('access-token')
export class DirectorsController {
  constructor(private service: DirectorsService) {}

  // Listagem liberada para qualquer usuário autenticado
  @Get()
  list() { return this.service.list(); }

  // Operações de escrita apenas ADMIN
  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Tiaguinho' },
        contact: { type: 'string', example: '11999990000' },
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
        contact: { type: 'string' },
        active: { type: 'boolean' },
      },
    },
  })
  update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
