import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { GamesService } from './games.service';

@Controller('games')
@UseGuards(RolesGuard)
@ApiTags('Games')
@ApiBearerAuth('access-token')
export class GamesController {
  constructor(private service: GamesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({ type: CreateGameDto })
  create(@Body() body: CreateGameDto) {
    return this.service.create(body);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiBody({ type: UpdateGameDto })
  update(@Param('id') id: string, @Body() body: UpdateGameDto) {
    return this.service.update(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.service.setStatus(id, 'FECHADO');
  }

  @Roles(Role.ADMIN)
  @Post(':id/reopen')
  reopen(@Param('id') id: string) {
    return this.service.setStatus(id, 'ABERTO');
  }
}
