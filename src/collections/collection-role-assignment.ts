import { MemberRole, Prisma } from '@prisma/client';

export async function findRoleAssignmentForEnd(
  tx: Prisma.TransactionClient,
  teamId: string,
  memberId: string,
  role: MemberRole,
  today: Date,
  assignmentId?: string,
) {
  if (assignmentId) {
    return tx.memberRoleAssignment.findFirst({ where: { id: assignmentId, teamId, memberId, role } });
  }
  const current = await tx.memberRoleAssignment.findFirst({
    where: {
      teamId, memberId, role,
      startsAt: { lte: today },
      OR: [{ endsAt: null }, { endsAt: { gte: today } }],
    },
    orderBy: { startsAt: 'desc' },
  });
  return current ?? tx.memberRoleAssignment.findFirst({
    where: { teamId, memberId, role, startsAt: { gt: today } },
    orderBy: { startsAt: 'asc' },
  });
}
