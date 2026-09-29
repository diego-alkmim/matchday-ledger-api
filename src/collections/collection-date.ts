export function collectionToday() {
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${value}T00:00:00.000Z`);
}
