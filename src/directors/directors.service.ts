import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DirectorsService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.director.findMany(); }
  create(data: any) { return this.prisma.director.create({ data }); }
  update(id: string, data: any) { return this.prisma.director.update({ where: { id }, data }); }
  remove(id: string) { return this.prisma.director.delete({ where: { id } }); }
}
