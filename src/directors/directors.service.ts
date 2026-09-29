import { Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectorDto } from './dto/create-director.dto';
import { UpdateDirectorDto } from './dto/update-director.dto';
import { domainErrors } from '../common/errors/domain-errors';
import { CollectionsReconciliationService } from '../collections/collections-reconciliation.service';
import { CollectionsGenerationService } from '../collections/collections-generation.service';
import { CollectionsLedgerService } from '../collections/collections-ledger.service';
import { generateObligationsThroughToday } from '../collections/collections-generation-range';
import { collectionToday } from '../collections/collection-date';

@Injectable()
export class DirectorsService {
  constructor(
    private prisma: PrismaService,
    private reconciliation: CollectionsReconciliationService,
    private generation: CollectionsGenerationService,
    private ledger: CollectionsLedgerService,
  ) {}

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

  async create(data: CreateDirectorDto, teamId: string, actorId: string) {
    const director = await this.reconciliation.runSerializable(async (tx) => {
      const activeFrom = collectionToday();
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
      if (data.active !== false && !member.roles.some((role) =>
        role.role === MemberRole.DIRECTOR && (!role.endsAt || role.endsAt >= activeFrom),
      )) {
        await tx.memberRoleAssignment.create({
          data: { teamId, memberId: member.id, role: MemberRole.DIRECTOR, startsAt: activeFrom },
        });
      }
      const director = await tx.director.create({ data: { ...data, teamId, memberId: member.id } });
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId, member.id);
      if (data.active !== false) {
        await generateObligationsThroughToday(
          this.generation, this.ledger, tx, teamId, activeFrom, collectionToday(), member.id,
        );
      }
      return director;
    });
    return director;
  }

  async update(id: string, data: UpdateDirectorDto, teamId: string, actorId: string) {
    const currentDirector = await this.assertExists(id, teamId);
    const director = await this.reconciliation.runSerializable(async (tx) => {
      let directorRoleActivated = false;
      const director = await tx.director.update({
        where: { id_teamId: { id, teamId } },
        data: data as Prisma.DirectorUpdateInput,
      });
      if (director.memberId) {
        const roleDate = collectionToday();
        await tx.member.update({
          where: { id_teamId: { id: director.memberId, teamId } },
          data: {
            name: data.name,
            contact: data.contact,
            ...(data.active === true ? { active: true, inactiveAt: null } : {}),
          },
        });
        if (data.active === false) {
          await this.deactivateDirectorRole(tx, teamId, director.memberId, roleDate);
          const remainingRoles = await tx.memberRoleAssignment.count({
            where: { teamId, memberId: director.memberId, endsAt: null },
          });
          if (remainingRoles === 0) {
            const latestRole = await tx.memberRoleAssignment.findFirst({
              where: { teamId, memberId: director.memberId }, orderBy: { endsAt: 'desc' }, select: { endsAt: true },
            });
            const inactiveAt = latestRole?.endsAt ?? roleDate;
            await tx.member.update({
              where: { id_teamId: { id: director.memberId, teamId } },
              data: { active: inactiveAt >= roleDate, inactiveAt },
            });
          }
        } else if (data.active === true) {
          const activeRole = await tx.memberRoleAssignment.findFirst({
            where: {
              teamId, memberId: director.memberId, role: MemberRole.DIRECTOR,
              OR: [{ endsAt: null }, { endsAt: { gte: roleDate } }],
            },
            orderBy: { startsAt: 'asc' },
          });
          if (!activeRole) {
            await tx.memberRoleAssignment.create({
              data: { teamId, memberId: director.memberId, role: MemberRole.DIRECTOR, startsAt: roleDate },
            });
            directorRoleActivated = true;
          } else if (activeRole.startsAt > roleDate) {
            await tx.memberRoleAssignment.update({
              where: { id: activeRole.id }, data: { startsAt: roleDate },
            });
            directorRoleActivated = true;
          }
        }
      }
      if (data.active !== undefined && director.memberId) {
        await this.reconciliation.reconcileInTransaction(tx, teamId, actorId, director.memberId);
        if (data.active && (!currentDirector.active || directorRoleActivated)) {
          await generateObligationsThroughToday(
            this.generation, this.ledger, tx, teamId, collectionToday(), collectionToday(), director.memberId,
          );
        }
      }
      return director;
    });
    return director;
  }

  async remove(id: string, teamId: string, actorId: string) {
    const director = await this.prisma.director.findUnique({ where: { id_teamId: { id, teamId } } });
    if (!director) throw new NotFoundException(domainErrors.directorNotFound);
    const inactiveAt = new Date();
    const updated = await this.reconciliation.runSerializable(async (tx) => {
      const updated = await tx.director.update({ where: { id_teamId: { id, teamId } }, data: { active: false } });
      if (director.memberId) {
        await this.deactivateDirectorRole(tx, teamId, director.memberId, inactiveAt);
        const remainingRoles = await tx.memberRoleAssignment.count({
          where: { teamId, memberId: director.memberId, endsAt: null },
        });
        if (remainingRoles === 0) {
          const latestRole = await tx.memberRoleAssignment.findFirst({
            where: { teamId, memberId: director.memberId }, orderBy: { endsAt: 'desc' }, select: { endsAt: true },
          });
          const memberInactiveAt = latestRole?.endsAt ?? inactiveAt;
          await tx.member.update({
            where: { id_teamId: { id: director.memberId, teamId } },
            data: { active: memberInactiveAt >= inactiveAt, inactiveAt: memberInactiveAt },
          });
        }
      }
      if (director.memberId) {
        await this.reconciliation.reconcileInTransaction(tx, teamId, actorId, director.memberId);
      }
      return updated;
    });
    return updated;
  }

  private async assertExists(id: string, teamId: string) {
    const director = await this.prisma.director.findUnique({
      where: { id_teamId: { id, teamId } },
      select: { id: true, active: true },
    });
    if (!director) throw new NotFoundException(domainErrors.directorNotFound);
    return director;
  }

  private async deactivateDirectorRole(
    tx: Prisma.TransactionClient,
    teamId: string,
    memberId: string,
    inactiveAt: Date,
  ) {
    const currentRole = await tx.memberRoleAssignment.findFirst({
      where: {
        teamId, memberId, role: MemberRole.DIRECTOR,
        startsAt: { lte: inactiveAt },
        OR: [{ endsAt: null }, { endsAt: { gt: inactiveAt } }],
      },
      orderBy: { startsAt: 'desc' },
    });
    if (currentRole) {
      await tx.memberRoleAssignment.update({ where: { id: currentRole.id }, data: { endsAt: inactiveAt } });
    }
    await tx.memberRoleAssignment.deleteMany({
      where: { teamId, memberId, role: MemberRole.DIRECTOR, startsAt: { gt: inactiveAt } },
    });
  }
}
