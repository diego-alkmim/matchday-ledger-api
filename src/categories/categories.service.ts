import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany();
  }

  create(data: CreateCategoryDto) {
    return this.prisma.category.create({
      data: data as Prisma.CategoryCreateInput,
    });
  }

  update(id: string, data: UpdateCategoryDto) {
    return this.prisma.category.update({
      where: { id },
      data: data as Prisma.CategoryUpdateInput,
    });
  }

  remove(id: string) {
    return this.prisma.category.delete({ where: { id } });
  }
}
