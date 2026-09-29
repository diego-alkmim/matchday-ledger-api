import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
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
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.service.list(user.teamId);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({ type: CreateDirectorDto })
  create(@Body() body: CreateDirectorDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.create(body, user.teamId, user.sub);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiBody({ type: UpdateDirectorDto })
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: UpdateDirectorDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.update(id, body, user.teamId, user.sub);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseCuidPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.service.remove(id, user.teamId, user.sub);
  }
}
