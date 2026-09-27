import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { hash, verify } from 'argon2';
import { randomUUID } from 'crypto';
import { domainErrors } from '../common/errors/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AccessTokenPayload } from './interfaces/access-token-payload.interface';
import { RefreshTokenPayload } from './interfaces/refresh-token-payload.interface';

const membershipInclude = { team: true } satisfies Prisma.TeamMembershipInclude;
type MembershipWithTeam = Prisma.TeamMembershipGetPayload<{ include: typeof membershipInclude }>;
type TeamSelectionPayload = { sub: string; tokenType: 'team-selection' };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException(domainErrors.invalidCredentials);
    }
    return user;
  }

  private async getMemberships(userId: string) {
    return this.prisma.teamMembership.findMany({
      where: { userId, active: true, team: { active: true } },
      include: membershipInclude,
      orderBy: { team: { name: 'asc' } },
    });
  }

  private toSessionUser(
    user: { id: string; email: string },
    membership: MembershipWithTeam,
    memberships: MembershipWithTeam[],
  ) {
    return {
      id: user.id,
      email: user.email,
      role: membership.role,
      directorId: membership.directorId,
      team: {
        id: membership.team.id,
        name: membership.team.name,
        slug: membership.team.slug,
      },
      teams: memberships.map(({ team, role }) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        role,
      })),
    };
  }

  private async generateSession(
    user: { id: string; email: string },
    membership: MembershipWithTeam,
    memberships: MembershipWithTeam[],
    userAgent?: string,
    ip?: string,
  ) {
    const csrfToken = randomUUID();
    const tokenId = randomUUID();
    const accessPayload: AccessTokenPayload = {
      tokenType: 'access',
      sub: user.id,
      sessionId: tokenId,
      membershipId: membership.id,
      teamId: membership.teamId,
      teamName: membership.team.name,
      teamSlug: membership.team.slug,
      role: membership.role,
      directorId: membership.directorId,
    };

    const access = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      teamId: membership.teamId,
      csrfToken,
      tid: tokenId,
    };
    const refresh = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '14d',
    });

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        tokenHash: await hash(refresh),
        userId: user.id,
        teamId: membership.teamId,
        userAgent,
        ip,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: this.toSessionUser(user, membership, memberships),
      access,
      refresh,
      csrfToken,
    };
  }

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.validateUser(dto);
    const memberships = await this.getMemberships(user.id);
    if (memberships.length === 0) {
      throw new ForbiddenException('Usuário sem acesso a um time ativo.');
    }

    if (memberships.length > 1) {
      const teamSelectionToken = await this.jwt.signAsync<TeamSelectionPayload>(
        { sub: user.id, tokenType: 'team-selection' },
        { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '5m' },
      );
      return {
        requiresTeamSelection: true as const,
        teamSelectionToken,
        teams: memberships.map(({ team, role }) => ({
          id: team.id,
          name: team.name,
          slug: team.slug,
          role,
        })),
      };
    }

    return {
      requiresTeamSelection: false as const,
      ...(await this.generateSession(user, memberships[0], memberships, userAgent, ip)),
    };
  }

  async selectTeam(token: string, teamId: string, userAgent?: string, ip?: string) {
    let payload: TeamSelectionPayload;
    try {
      payload = await this.jwt.verifyAsync<TeamSelectionPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('A seleção de time expirou. Entre novamente.');
    }
    if (payload.tokenType !== 'team-selection') {
      throw new UnauthorizedException(domainErrors.invalidCredentials);
    }

    return this.createSessionForTeam(payload.sub, teamId, userAgent, ip);
  }

  async switchTeam(user: AccessTokenPayload, teamId: string, userAgent?: string, ip?: string) {
    const session = await this.createSessionForTeam(user.sub, teamId, userAgent, ip);
    await this.prisma.refreshToken.updateMany({
      where: { id: user.sessionId, userId: user.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return session;
  }

  private async createSessionForTeam(userId: string, teamId: string, userAgent?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const memberships = await this.getMemberships(userId);
    const membership = memberships.find((item) => item.teamId === teamId);
    if (!user || !membership) {
      throw new ForbiddenException('Você não possui acesso a este time.');
    }
    return this.generateSession(user, membership, memberships, userAgent, ip);
  }

  async refresh(refreshToken: string, csrfToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new ForbiddenException(domainErrors.invalidCredentials);
    }
    if (payload.csrfToken !== csrfToken) {
      throw new ForbiddenException(domainErrors.invalidCsrf);
    }

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        id: payload.tid,
        userId: payload.sub,
        teamId: payload.teamId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!storedToken || !(await verify(storedToken.tokenHash, refreshToken).catch(() => false))) {
      throw new ForbiddenException(domainErrors.invalidCredentials);
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });
    return this.createSessionForTeam(payload.sub, payload.teamId);
  }

  async getCurrentUser(user: AccessTokenPayload) {
    const account = await this.prisma.user.findUnique({ where: { id: user.sub } });
    const memberships = await this.getMemberships(user.sub);
    const membership = memberships.find((item) => item.id === user.membershipId);
    if (!account || !membership || membership.teamId !== user.teamId) {
      throw new UnauthorizedException(domainErrors.invalidCredentials);
    }
    return this.toSessionUser(account, membership, memberships);
  }

  async logout(user: AccessTokenPayload) {
    await this.prisma.refreshToken.updateMany({
      where: { id: user.sessionId, userId: user.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
