import { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  directorId: string | null;
}
