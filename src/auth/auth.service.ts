import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { hash, verify } from 'argon2';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private config: ConfigService) {}

  async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');
    const ok = await verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');
    return user;
  }

  private async generateTokens(user: any) {
    const csrfToken = randomUUID();
    const tokenId = randomUUID();

    const access = await this.jwt.signAsync(
      { sub: user.id, role: user.role, directorId: user.directorId },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );

    const refreshPayload = { sub: user.id, csrfToken, tid: tokenId };
    const refresh = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
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

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.validateUser(dto);
    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync(refreshToken, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
    });

    // Fallback para tokens antigos sem tid: busca o mais recente do usuário e compara hash.
    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    let matched: { id: string } | null = null;
    for (const t of candidates) {
      const ok = await verify(t.tokenHash, refreshToken).catch(() => false);
      if (ok) {
        matched = { id: t.id };
        break;
      }
    }

    if (!matched) throw new ForbiddenException();

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new ForbiddenException();

    await this.prisma.refreshToken.update({ where: { id: matched.id }, data: { revokedAt: new Date() } });
    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return true;
  }
}
