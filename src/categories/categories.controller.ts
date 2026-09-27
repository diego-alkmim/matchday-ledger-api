import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesService } from './categories.service';

@Controller('categories')
@UseGuards(RolesGuard)
@ApiTags('Categories')
@ApiBearerAuth('access-token')
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.service.list(user.teamId);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({ type: CreateCategoryDto })
  create(@Body() body: CreateCategoryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.service.create(body, user.teamId);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiBody({ type: UpdateCategoryDto })
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: UpdateCategoryDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.service.update(id, body, user.teamId);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseCuidPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.service.remove(id, user.teamId);
  }
}
