import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  async create(data: CreateUserDto, teamId: string) {
    if (data.role === 'DIRETOR' && !data.directorId) {
      throw new BadRequestException('Selecione o diretor vinculado ao usuário.');
    }
    if (data.role === 'DIRETOR' && data.directorId) {
      const director = await this.prisma.director.findUnique({
        where: { id_teamId: { id: data.directorId, teamId } },
        select: { id: true },
      });
      if (!director) throw new NotFoundException('Diretor não encontrado.');

      const assignedMembership = await this.prisma.teamMembership.findFirst({
        where: { teamId, directorId: data.directorId },
        select: { id: true },
      });
      if (assignedMembership) {
        throw new ConflictException('Este diretor já possui um usuário vinculado.');
      }
    }

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: data.email } });
      if (!user) {
        user = await tx.user.create({ data: { email: data.email, passwordHash } });
      }

      const existingMembership = await tx.teamMembership.findUnique({
        where: { userId_teamId: { userId: user.id, teamId } },
      });
      if (existingMembership) {
        throw new ConflictException('Este usuário já possui acesso ao time.');
      }

      const membership = await tx.teamMembership.create({
        data: {
          userId: user.id,
          teamId,
          role: data.role,
          directorId: data.role === 'DIRETOR' ? data.directorId : null,
        },
      });
      return {
        id: user.id,
        email: user.email,
        role: membership.role,
        directorId: membership.directorId,
        createdAt: membership.createdAt,
      };
    });
  }
}
