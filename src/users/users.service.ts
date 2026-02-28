import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  findById(id: string) { return this.prisma.user.findUnique({ where: { id } }); }

  async create(data: CreateUserDto) {
    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        directorId: data.directorId || null,
      },
      select: { id: true, email: true, role: true, directorId: true, createdAt: true },
    });
  }
}
