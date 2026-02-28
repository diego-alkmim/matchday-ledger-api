import { Body, Controller, Get, Post, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { GamesService } from './games.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';

@Controller('games')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Games')
@ApiBearerAuth('access-token')
export class GamesController {
  constructor(private service: GamesService) {}
  @Get() list() { return this.service.list(); }
  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['date', 'status'],
      properties: {
        date: { type: 'string', format: 'date-time', example: '2026-02-22T14:00:00Z' },
        opponent: { type: 'string', example: 'Time X' },
        location: { type: 'string', example: 'Arena Local' },
        status: { type: 'string', enum: ['ABERTO', 'FECHADO'], example: 'ABERTO' },
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
        date: { type: 'string', format: 'date-time' },
        opponent: { type: 'string' },
        location: { type: 'string' },
        status: { type: 'string', enum: ['ABERTO', 'FECHADO'] },
      },
    },
  })
  update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }
  @Roles(Role.ADMIN)
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Roles(Role.ADMIN)
  @Post(':id/close') close(@Param('id') id: string) { return this.service.setStatus(id, 'FECHADO'); }
  @Roles(Role.ADMIN)
  @Post(':id/reopen') reopen(@Param('id') id: string) { return this.service.setStatus(id, 'ABERTO'); }
}
