import { Matches } from 'class-validator';

// Prisma's default CUID has a lowercase "c" followed by 24 alphanumeric characters.
export const CUID_REGEX = /^c[a-z0-9]{24}$/;

export function IsCuid(field: string) {
  return Matches(CUID_REGEX, {
    message: `${field} deve ter um identificador válido.`,
  });
}
