import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectorDto } from './dto/create-director.dto';
import { UpdateDirectorDto } from './dto/update-director.dto';
import { domainErrors } from '../common/errors/domain-errors';

@Injectable()
export class DirectorsService {
  constructor(private prisma: PrismaService) {}

  list(teamId: string) {
    return this.prisma.director.findMany({ where: { teamId }, orderBy: { name: 'asc' } });
  }

  create(data: CreateDirectorDto, teamId: string) {
    return this.prisma.director.create({
      data: { ...data, teamId },
    });
  }

  async update(id: string, data: UpdateDirectorDto, teamId: string) {
    await this.assertExists(id, teamId);
    return this.prisma.director.update({
      where: { id_teamId: { id, teamId } },
      data: data as Prisma.DirectorUpdateInput,
    });
  }

  async remove(id: string, teamId: string) {
    await this.assertExists(id, teamId);
    return this.prisma.director.delete({ where: { id_teamId: { id, teamId } } });
  }

  private async assertExists(id: string, teamId: string) {
    const director = await this.prisma.director.findUnique({
      where: { id_teamId: { id, teamId } },
      select: { id: true },
    });
    if (!director) throw new NotFoundException(domainErrors.directorNotFound);
  }
}
