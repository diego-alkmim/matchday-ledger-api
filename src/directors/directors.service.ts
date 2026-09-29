import { Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectorDto } from './dto/create-director.dto';
import { UpdateDirectorDto } from './dto/update-director.dto';
import { domainErrors } from '../common/errors/domain-errors';

@Injectable()
export class DirectorsService {
  constructor(private prisma: PrismaService) {}

  list(teamId: string) {
    const currentDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const now = new Date(`${currentDate}T00:00:00.000Z`);
    return this.prisma.director.findMany({
      where: {
        teamId,
        OR: [
          { memberId: null, active: true },
          {
            member: {
              roles: {
                some: {
                  role: MemberRole.DIRECTOR,
                  startsAt: { lte: now },
                  OR: [{ endsAt: null }, { endsAt: { gte: now } }],
                },
              },
            },
          },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }

  create(data: CreateDirectorDto, teamId: string) {
    return this.prisma.$transaction(async (tx) => {
      const activeFrom = new Date();
      const existingMember = await tx.member.findUnique({
        where: { teamId_name: { teamId, name: data.name } },
        include: { roles: true },
      });
      const member = existingMember ?? await tx.member.create({
        data: { teamId, name: data.name, contact: data.contact, active: data.active ?? true, activeFrom },
        include: { roles: true },
      });
      if (existingMember) {
        await tx.member.update({
          where: { id_teamId: { id: member.id, teamId } },
          data: { active: data.active ?? true, inactiveAt: null, contact: data.contact ?? member.contact },
        });
      }
      if (!member.roles.some((role) => role.role === MemberRole.DIRECTOR && !role.endsAt)) {
        await tx.memberRoleAssignment.create({
          data: { teamId, memberId: member.id, role: MemberRole.DIRECTOR, startsAt: activeFrom },
        });
      }
      return tx.director.create({ data: { ...data, teamId, memberId: member.id } });
    });
  }

  async update(id: string, data: UpdateDirectorDto, teamId: string) {
    await this.assertExists(id, teamId);
    return this.prisma.$transaction(async (tx) => {
      const director = await tx.director.update({
        where: { id_teamId: { id, teamId } },
        data: data as Prisma.DirectorUpdateInput,
      });
      if (director.memberId) {
        const roleDate = new Date();
        await tx.member.update({
          where: { id_teamId: { id: director.memberId, teamId } },
          data: {
            name: data.name,
            contact: data.contact,
            ...(data.active === true ? { active: true, inactiveAt: null } : {}),
          },
        });
        if (data.active === false) {
          await tx.memberRoleAssignment.updateMany({
            where: { teamId, memberId: director.memberId, role: MemberRole.DIRECTOR, endsAt: null },
            data: { endsAt: roleDate },
          });
          const remainingRoles = await tx.memberRoleAssignment.count({
            where: { teamId, memberId: director.memberId, endsAt: null },
          });
          if (remainingRoles === 0) {
            await tx.member.update({
              where: { id_teamId: { id: director.memberId, teamId } },
              data: { active: false, inactiveAt: roleDate },
            });
          }
        } else if (data.active === true) {
          const activeRole = await tx.memberRoleAssignment.findFirst({
            where: { teamId, memberId: director.memberId, role: MemberRole.DIRECTOR, endsAt: null },
          });
          if (!activeRole) {
            await tx.memberRoleAssignment.create({
              data: { teamId, memberId: director.memberId, role: MemberRole.DIRECTOR, startsAt: roleDate },
            });
          }
        }
      }
      return director;
    });
  }

  async remove(id: string, teamId: string) {
    const director = await this.prisma.director.findUnique({ where: { id_teamId: { id, teamId } } });
    if (!director) throw new NotFoundException(domainErrors.directorNotFound);
    const inactiveAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.director.update({ where: { id_teamId: { id, teamId } }, data: { active: false } });
      if (director.memberId) {
        await tx.memberRoleAssignment.updateMany({ where: { teamId, memberId: director.memberId, role: MemberRole.DIRECTOR, endsAt: null }, data: { endsAt: inactiveAt } });
        const remainingRoles = await tx.memberRoleAssignment.count({
          where: { teamId, memberId: director.memberId, endsAt: null },
        });
        if (remainingRoles === 0) {
          await tx.member.update({ where: { id_teamId: { id: director.memberId, teamId } }, data: { active: false, inactiveAt } });
        }
      }
      return updated;
    });
  }

  private async assertExists(id: string, teamId: string) {
    const director = await this.prisma.director.findUnique({
      where: { id_teamId: { id, teamId } },
      select: { id: true },
    });
    if (!director) throw new NotFoundException(domainErrors.directorNotFound);
  }
}
