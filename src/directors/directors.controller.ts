import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateDirectorDto } from './dto/create-director.dto';
import { UpdateDirectorDto } from './dto/update-director.dto';
import { DirectorsService } from './directors.service';

@Controller('directors')
@UseGuards(RolesGuard)
@ApiTags('Directors')
@ApiBearerAuth('access-token')
export class DirectorsController {
  constructor(private service: DirectorsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({ type: CreateDirectorDto })
  create(@Body() body: CreateDirectorDto) {
    return this.service.create(body);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiBody({ type: UpdateDirectorDto })
  update(@Param('id') id: string, @Body() body: UpdateDirectorDto) {
    return this.service.update(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
