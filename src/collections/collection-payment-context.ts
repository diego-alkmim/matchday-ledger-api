import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CollectionFrequency, GameStatus, Prisma } from '@prisma/client';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateCollectionPaymentDto } from './dto/collections.dto';

export async function loadPaymentContext(
  tx: Prisma.TransactionClient,
  dto: CreateCollectionPaymentDto,
  user: AccessTokenPayload,
) {
  const [member, plan, game] = await Promise.all([
    tx.member.findUnique({
      where: { id_teamId: { id: dto.memberId, teamId: user.teamId } },
      include: { roles: true },
    }),
    tx.collectionPlan.findUnique({ where: { id_teamId: { id: dto.planId, teamId: user.teamId } } }),
    dto.gameId
      ? tx.game.findUnique({ where: { id_teamId: { id: dto.gameId, teamId: user.teamId } } })
      : Promise.resolve(null),
  ]);
  if (!member || !plan) throw new NotFoundException('Participante ou plano não encontrado.');
  if (plan.frequency === CollectionFrequency.PER_GAME && !game) {
    throw new BadRequestException('Selecione o jogo referente ao pagamento.');
  }
  if (plan.frequency === CollectionFrequency.MONTHLY && dto.gameId) {
    throw new BadRequestException('Pagamentos mensais não devem ser vinculados a um jogo.');
  }
  if (game?.status === GameStatus.FECHADO) {
    throw new BadRequestException('Não é permitido registrar pagamento em jogo fechado.');
  }
  const paymentDate = new Date(dto.date);
  const eligibilityDate = plan.frequency === CollectionFrequency.PER_GAME ? game!.date : paymentDate;
  const activeRoles = member.roles.filter((role) =>
    role.startsAt <= eligibilityDate && (!role.endsAt || role.endsAt >= eligibilityDate),
  );
  if (
    !activeRoles.some((role) => role.role === plan.audienceRole) ||
    plan.effectiveFrom > eligibilityDate ||
    (plan.inactiveAt && plan.inactiveAt < eligibilityDate)
  ) {
    throw new BadRequestException('O plano não está vigente para este participante no período informado.');
  }
  const higherPriorityPlan = await tx.collectionPlan.findFirst({
    where: {
      teamId: user.teamId,
      exclusiveGroup: plan.exclusiveGroup,
      audienceRole: { in: activeRoles.map((role) => role.role) },
      effectiveFrom: { lte: eligibilityDate },
      OR: [
        { inactiveAt: null, priority: { gt: plan.priority } },
        { inactiveAt: { gte: eligibilityDate }, priority: { gt: plan.priority } },
        { inactiveAt: null, priority: plan.priority, id: { lt: plan.id } },
        { inactiveAt: { gte: eligibilityDate }, priority: plan.priority, id: { lt: plan.id } },
      ],
    },
    select: { id: true },
  });
  if (higherPriorityPlan) {
    throw new BadRequestException('Outro plano tem prioridade para este participante na data informada.');
  }
  return { member, plan };
}
