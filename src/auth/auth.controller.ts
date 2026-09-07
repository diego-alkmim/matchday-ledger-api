import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { domainErrors } from '../common/errors/domain-errors';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { LoginDto, LoginSchema } from './dto/login.dto';
import { RefreshDto, RefreshSchema } from './dto/refresh.dto';
import { AuthService } from './auth.service';
import { AccessTokenPayload } from './interfaces/access-token-payload.interface';

function getRefreshCookie(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (!cookies || typeof cookies !== 'object') return undefined;

  const token = (cookies as Record<string, unknown>).refresh_token;
  return typeof token === 'string' ? token : undefined;
}

function getUserAgent(req: Request): string | undefined {
  const userAgent = req.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent : undefined;
}

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Login',
    description:
      'Autentica usuário e retorna access token (header) + refresh token em cookie HttpOnly.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'admin@santafe.local' },
        password: { type: 'string', minLength: 8, example: 'SenhaForte123!' },
      },
    },
  })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const data = LoginSchema.parse(body);
    const { user, access, refresh, csrfToken } = await this.auth.login(
      data,
      getUserAgent(req),
      req.ip,
    );

    this.setRefreshCookie(res, refresh);
    res.setHeader('x-csrf-token', csrfToken);
    return { accessToken: access, user, csrfToken };
  }

  @Post('refresh')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Renovar access token',
    description:
      'Usa refresh_token (cookie HttpOnly) + CSRF token para emitir novo access token curto.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['csrfToken'],
      properties: {
        csrfToken: { type: 'string', example: 'csrf-token-da-sessao' },
      },
    },
  })
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { csrfToken } = RefreshSchema.parse(body);
    const refreshCookie = getRefreshCookie(req);

    if (!refreshCookie) {
      throw new BadRequestException(domainErrors.refreshTokenMissing);
    }

    const payload = await this.auth.refresh(refreshCookie);

    if (csrfToken !== req.headers['x-csrf-token']) {
      throw new ForbiddenException(domainErrors.invalidCsrf);
    }

    this.setRefreshCookie(res, payload.refresh);
    res.setHeader('x-csrf-token', payload.csrfToken);
    return { accessToken: payload.access, user: payload.user, csrfToken: payload.csrfToken };
  }

  @Post('logout')
  @ApiBearerAuth('access-token')
  async logout(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.sub);
    res.clearCookie('refresh_token', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  me(@CurrentUser() user: AccessTokenPayload) {
    return user;
  }

  private setRefreshCookie(res: Response, token: string) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });
  }
}
