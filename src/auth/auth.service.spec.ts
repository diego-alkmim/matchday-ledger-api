import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { hash } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService multi-tenant sessions', () => {
  const userFindUnique = jest.fn();
  const membershipFindMany = jest.fn();
  const refreshCreate = jest.fn<Promise<unknown>, [unknown]>();
  const prisma = {
    user: { findUnique: userFindUnique },
    teamMembership: { findMany: membershipFindMany },
    refreshToken: { create: refreshCreate },
  } as unknown as PrismaService;
  const signAsync = jest.fn((payload: Record<string, unknown>) =>
    Promise.resolve(payload.tokenType === 'access' ? 'access-token' : 'signed-token'),
  );
  const verifyAsync = jest.fn();
  const jwt = { signAsync, verifyAsync } as unknown as JwtService;
  const config = {
    getOrThrow: jest.fn((key: string) => `${key}-for-tests`),
  } as unknown as ConfigService;
  const service = new AuthService(prisma, jwt, config);
  let passwordHash: string;

  const membership = (id: string, teamId: string, name: string) => ({
    id,
    userId: 'user-1',
    teamId,
    role: Role.ADMIN,
    directorId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    team: {
      id: teamId,
      name,
      slug: name.toLowerCase().replace(/ /g, '-'),
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  beforeAll(async () => {
    passwordHash = await hash('SenhaForte123!');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash,
      createdAt: new Date(),
    });
  });

  it('returns a short-lived selection flow when the user has multiple teams', async () => {
    membershipFindMany.mockResolvedValue([
      membership('membership-1', 'team-1', 'Team One'),
      membership('membership-2', 'team-2', 'Team Two'),
    ]);

    const result = await service.login({
      email: 'admin@example.com',
      password: 'SenhaForte123!',
      turnstileToken: 'verified-token',
    });

    expect(result.requiresTeamSelection).toBe(true);
    expect(result.teams).toHaveLength(2);
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'user-1', tokenType: 'team-selection' },
      expect.objectContaining({ expiresIn: '5m' }),
    );
    expect(refreshCreate).not.toHaveBeenCalled();
  });

  it('creates a team-bound session when the user has one team', async () => {
    membershipFindMany.mockResolvedValue([membership('membership-1', 'team-1', 'Team One')]);
    refreshCreate.mockResolvedValue({ id: 'session-1' });

    const result = await service.login({
      email: 'admin@example.com',
      password: 'SenhaForte123!',
      turnstileToken: 'verified-token',
    });

    expect(result.requiresTeamSelection).toBe(false);
    if (!('user' in result)) throw new Error('Expected an authenticated session');
    expect(result.user.team.id).toBe('team-1');
    expect(refreshCreate).toHaveBeenCalled();
    const refreshCall = refreshCreate.mock.calls[0]?.[0] as unknown as {
      data: { userId: string; teamId: string };
    };
    expect(refreshCall.data.userId).toBe('user-1');
    expect(refreshCall.data.teamId).toBe('team-1');
  });

  it('rejects refresh when CSRF does not match the signed token', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'user-1',
      teamId: 'team-1',
      tid: 'session-1',
      csrfToken: 'signed-csrf',
    });

    await expect(service.refresh('refresh-token', 'different-csrf')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
