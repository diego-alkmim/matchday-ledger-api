import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.category.findMany(); }
  create(data: any) { return this.prisma.category.create({ data }); }
  update(id: string, data: any) { return this.prisma.category.update({ where: { id }, data }); }
  remove(id: string) { return this.prisma.category.delete({ where: { id } }); }
}
