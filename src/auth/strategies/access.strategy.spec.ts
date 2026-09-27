import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload } from '../interfaces/access-token-payload.interface';
import { AccessStrategy } from './access.strategy';

describe('AccessStrategy', () => {
  const findFirst = jest.fn();
  const prisma = { teamMembership: { findFirst } } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn(() => 'a-secure-test-secret'),
  } as unknown as ConfigService;
  const strategy = new AccessStrategy(config, prisma);
  const payload: AccessTokenPayload = {
    tokenType: 'access',
    sub: 'user-1',
    sessionId: 'session-1',
    membershipId: 'membership-1',
    teamId: 'team-1',
    teamName: 'Team One',
    teamSlug: 'team-one',
    role: Role.ADMIN,
    directorId: null,
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects a team selection token before querying memberships', async () => {
    await expect(
      strategy.validate({ ...payload, tokenType: 'team-selection' } as unknown as AccessTokenPayload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('accepts only the active membership encoded in the access token', async () => {
    findFirst.mockResolvedValue({ id: 'membership-1' });
    await expect(strategy.validate(payload)).resolves.toEqual(payload);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'membership-1',
        userId: 'user-1',
        teamId: 'team-1',
        role: Role.ADMIN,
        directorId: null,
        active: true,
        team: { active: true },
      },
      select: { id: true },
    });
  });
});
