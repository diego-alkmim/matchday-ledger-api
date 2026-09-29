export function collectionGenerationRange(from: string | undefined, to: string | undefined, effectiveDates: Date[]) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const earliestPlan = effectiveDates.reduce((earliest, date) => date < earliest ? date : earliest);
  return {
    from: from ?? (to ? `${to.slice(0, 4)}-01-01` : earliestPlan.toISOString().slice(0, 10)),
    to: to ?? today,
  };
}

export function isInCollectionRange(date: Date, from?: string, to?: string) {
  const timestamp = date.getTime();
  const startsAt = from ? new Date(`${from}T00:00:00.000Z`).getTime() : Number.NEGATIVE_INFINITY;
  const endsAt = to ? new Date(`${to}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
  return timestamp >= startsAt && timestamp <= endsAt;
}
