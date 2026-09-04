import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectorDto } from './dto/create-director.dto';
import { UpdateDirectorDto } from './dto/update-director.dto';

@Injectable()
export class DirectorsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.director.findMany();
  }

  create(data: CreateDirectorDto) {
    return this.prisma.director.create({
      data: data as Prisma.DirectorCreateInput,
    });
  }

  update(id: string, data: UpdateDirectorDto) {
    return this.prisma.director.update({
      where: { id },
      data: data as Prisma.DirectorUpdateInput,
    });
  }

  remove(id: string) {
    return this.prisma.director.delete({ where: { id } });
  }
}
