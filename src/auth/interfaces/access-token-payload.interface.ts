import { Role } from '@prisma/client';

export interface AccessTokenPayload {
  tokenType: 'access';
  sub: string;
  sessionId: string;
  membershipId: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  role: Role;
  directorId: string | null;
}
