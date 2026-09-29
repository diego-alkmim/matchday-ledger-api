import { MemberRole, Prisma } from '@prisma/client';

export function historicalDirectorWhere(
  teamId: string,
  dateFilter?: Prisma.DateTimeFilter,
): Prisma.DirectorWhereInput {
  const startsBefore = dateFilter?.lte ? new Date(dateFilter.lte as string | Date) : undefined;
  const endsAfter = dateFilter?.gte ? new Date(dateFilter.gte as string | Date) : undefined;

  return {
    teamId,
    OR: [
      { active: true },
      {
        member: {
          roles: {
            some: {
              role: MemberRole.DIRECTOR,
              ...(startsBefore ? { startsAt: { lte: startsBefore } } : {}),
              ...(endsAfter ? { OR: [{ endsAt: null }, { endsAt: { gte: endsAfter } }] } : {}),
            },
          },
        },
      },
      {
        transactions: {
          some: {
            reversedAt: null,
            type: 'ENTRADA',
            category: { name: 'Diretoria' },
            ...(dateFilter ? { game: { date: dateFilter } } : {}),
          },
        },
      },
    ],
  };
}
