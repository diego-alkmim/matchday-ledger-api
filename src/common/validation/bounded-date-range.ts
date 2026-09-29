import { BadRequestException } from '@nestjs/common';

export function assertBoundedDateRange(from: string, to: string, maxDays = 366) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > maxDays) {
    throw new BadRequestException(
      `O per\u00edodo deve ter no m\u00e1ximo ${maxDays} dias e a data inicial n\u00e3o pode superar a final.`,
    );
  }
  return { start, end, days };
}
