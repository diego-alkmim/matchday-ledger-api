import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { collectionToday } from './collection-date';
import { CollectionsReconciliationService } from './collections-reconciliation.service';

@Injectable()
export class CollectionsRoleScheduleService {
  constructor(private reconciliation: CollectionsReconciliationService) {}

  reschedule(
    teamId: string,
    memberId: string,
    assignmentId: string,
    startsAt: string,
    actorId: string,
  ) {
    const startDate = new Date(startsAt);
    return this.reconciliation.runSerializable(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id_teamId: { id: memberId, teamId } },
        include: { roles: true },
      });
      if (!member) throw new NotFoundException('Participante não encontrado.');
      const assignment = member.roles.find((item) => item.id === assignmentId);
      if (!assignment || assignment.startsAt <= collectionToday()) {
        throw new NotFoundException('Função agendada não encontrada.');
      }
      if (startDate < collectionToday() || startDate < member.activeFrom) {
        throw new BadRequestException('A nova data deve ser atual ou futura e posterior à entrada do participante.');
      }
      if (assignment.endsAt && startDate > assignment.endsAt) {
        throw new BadRequestException('A nova data não pode ser posterior ao término agendado da função.');
      }
      const overlaps = member.roles.some((item) =>
        item.id !== assignment.id &&
        item.role === assignment.role &&
        (!item.endsAt || item.endsAt >= startDate),
      );
      if (overlaps) throw new BadRequestException('A nova data sobrepõe outro período desta função.');
      const updated = await tx.memberRoleAssignment.update({
        where: { id: assignment.id },
        data: { startsAt: startDate },
      });
      await this.reconciliation.reconcileInTransaction(tx, teamId, actorId);
      return updated;
    });
  }
}
