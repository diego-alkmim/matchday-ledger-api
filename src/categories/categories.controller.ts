import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
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
  list() {
    return this.service.list();
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({ type: CreateCategoryDto })
  create(@Body() body: CreateCategoryDto) {
    return this.service.create(body);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiBody({ type: UpdateCategoryDto })
  update(@Param('id', ParseCuidPipe) id: string, @Body() body: UpdateCategoryDto) {
    return this.service.update(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseCuidPipe) id: string) {
    return this.service.remove(id);
  }
}
