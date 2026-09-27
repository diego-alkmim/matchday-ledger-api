import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { domainErrors } from '../common/errors/domain-errors';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  list(teamId: string) {
    return this.prisma.category.findMany({ where: { teamId }, orderBy: { name: 'asc' } });
  }

  create(data: CreateCategoryDto, teamId: string) {
    return this.prisma.category.create({
      data: { ...data, teamId },
    });
  }

  async update(id: string, data: UpdateCategoryDto, teamId: string) {
    await this.assertExists(id, teamId);
    return this.prisma.category.update({
      where: { id_teamId: { id, teamId } },
      data: data as Prisma.CategoryUpdateInput,
    });
  }

  async remove(id: string, teamId: string) {
    await this.assertExists(id, teamId);
    return this.prisma.category.delete({ where: { id_teamId: { id, teamId } } });
  }

  private async assertExists(id: string, teamId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id_teamId: { id, teamId } },
      select: { id: true },
    });
    if (!category) throw new NotFoundException(domainErrors.categoryNotFound);
  }
}
