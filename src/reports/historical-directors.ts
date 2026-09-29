import { ContributionMode, MemberRole, Prisma } from '@prisma/client';
import {
  buildDirectorConsolidation,
  ContributionObligation,
  DirectorPayment,
  ReportDirector,
} from './director-consolidation';

export const historicalDirectorSelect = {
  id: true,
  memberId: true,
  name: true,
  contact: true,
  active: true,
  member: {
    select: {
      roles: {
        where: { role: MemberRole.DIRECTOR },
        select: { startsAt: true, endsAt: true },
      },
    },
  },
} satisfies Prisma.DirectorSelect;

type HistoricalDirector = ReportDirector & {
  memberId: string | null;
  active: boolean;
  member: { roles: Array<{ startsAt: Date; endsAt: Date | null }> } | null;
};

export function buildHistoricalDirectorEntries(
  directors: HistoricalDirector[],
  obligations: ContributionObligation[],
  paymentsByDirector: Map<string, DirectorPayment[]>,
  mode: ContributionMode,
) {
  return directors.flatMap((director) => {
    const payments = paymentsByDirector.get(director.id) ?? [];
    const scopedObligations = obligationsForDirector(director, obligations, payments.length > 0);
    if (!scopedObligations.length && !payments.length) return [];
    return [buildDirectorConsolidation(director, scopedObligations, payments, mode)];
  });
}

function obligationsForDirector(
  director: HistoricalDirector,
  obligations: ContributionObligation[],
  hasPayments: boolean,
) {
  if (!director.member) {
    return director.active || hasPayments ? obligations : [];
  }
  return obligations.filter((obligation) => director.member!.roles.some((role) =>
    role.startsAt <= obligation.date && (!role.endsAt || role.endsAt >= obligation.date),
  ));
}
