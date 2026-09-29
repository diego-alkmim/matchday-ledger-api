export function isInCollectionRange(date: Date, from?: string, to?: string) {
  const timestamp = date.getTime();
  const startsAt = from ? new Date(`${from}T00:00:00.000Z`).getTime() : Number.NEGATIVE_INFINITY;
  const endsAt = to ? new Date(`${to}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
  return timestamp >= startsAt && timestamp <= endsAt;
}
