import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { domainErrors } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload } from '../interfaces/access-token-payload.interface';

@Injectable()
export class AccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private prisma: PrismaService) {
    const secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  async validate(payload: AccessTokenPayload) {
    if (
      payload.tokenType !== 'access' ||
      !payload.sub ||
      !payload.sessionId ||
      !payload.membershipId ||
      !payload.teamId
    ) {
      throw new UnauthorizedException(domainErrors.invalidCredentials);
    }
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        id: payload.membershipId,
        userId: payload.sub,
        teamId: payload.teamId,
        role: payload.role,
        directorId: payload.directorId,
        active: true,
        team: { active: true },
      },
      select: { id: true },
    });
    if (!membership) throw new UnauthorizedException(domainErrors.invalidCredentials);
    return payload;
  }
}
