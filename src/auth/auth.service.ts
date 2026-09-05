import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { hash, verify } from 'argon2';
import { randomUUID } from 'crypto';
import { domainErrors } from '../common/errors/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenPayload } from './interfaces/refresh-token-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException(domainErrors.invalidCredentials);

    const ok = await verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException(domainErrors.invalidCredentials);

    return user;
  }

  private async generateTokens(user: Pick<User, 'id' | 'role' | 'directorId'>) {
    const csrfToken = randomUUID();
    const tokenId = randomUUID();

    const access = await this.jwt.signAsync(
      { sub: user.id, role: user.role as Role, directorId: user.directorId },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );

    const refreshPayload = { sub: user.id, csrfToken, tid: tokenId };
    const refresh = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '14d',
    });

    const tokenHash = await hash(refresh);
    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return { access, refresh, csrfToken };
  }

  async login(dto: LoginDto, _userAgent?: string, _ip?: string) {
    const user = await this.validateUser(dto);
    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });

    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    let matched: { id: string } | null = null;
    for (const token of candidates) {
      const ok = await verify(token.tokenHash, refreshToken).catch(() => false);
      if (ok) {
        matched = { id: token.id };
        break;
      }
    }

    if (!matched) throw new ForbiddenException(domainErrors.invalidCredentials);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new ForbiddenException(domainErrors.invalidCredentials);

    await this.prisma.refreshToken.update({
      where: { id: matched.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  }
}
