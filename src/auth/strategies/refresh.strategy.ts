import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { domainErrors } from '../../common/errors/domain-errors';
import { RefreshTokenPayload } from '../interfaces/refresh-token-payload.interface';

function cookieExtractor(req: Request): string | null {
  const cookies: unknown = req.cookies;
  if (!cookies || typeof cookies !== 'object') return null;

  const token = (cookies as Record<string, unknown>).refresh_token;
  return typeof token === 'string' ? token : null;
}

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    const secret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    super({
      jwtFromRequest: cookieExtractor,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshTokenPayload) {
    const csrfHeader = req.headers['x-csrf-token'];
    if (!csrfHeader || csrfHeader !== payload.csrfToken) {
      throw new Error(domainErrors.invalidCsrf);
    }
    return payload;
  }
}
