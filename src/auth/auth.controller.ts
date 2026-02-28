import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginSchema, LoginDto } from './dto/login.dto';
import { RefreshSchema, RefreshDto } from './dto/refresh.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 60 } })
  @ApiOperation({ summary: 'Login', description: 'Autentica usuário e retorna access token (header) + refresh token em cookie HttpOnly.' })
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
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response, @Req() req: Request) {
    const data = LoginSchema.parse(body);
    const { user, access, refresh, csrfToken } = await this.auth.login(data, req.headers['user-agent'], req.ip);
    this.setRefreshCookie(res, refresh);
    res.setHeader('x-csrf-token', csrfToken);
    return { accessToken: access, user, csrfToken };
  }

  @Post('refresh')
  @Throttle({ auth: { limit: 5, ttl: 60 } })
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Renovar access token', description: 'Usa refresh_token (cookie HttpOnly) + CSRF token para emitir novo access token curto.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['csrfToken'],
      properties: {
        csrfToken: { type: 'string', example: 'csrf-token-da-sessao' },
      },
    },
  })
  async refresh(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { csrfToken } = RefreshSchema.parse(body);
    const refreshCookie = req.cookies['refresh_token'];
    if (!refreshCookie) throw new Error('No refresh');
    const payload = await this.auth.refresh(refreshCookie);
    if (csrfToken !== req.headers['x-csrf-token']) throw new Error('CSRF mismatch');
    this.setRefreshCookie(res, payload.refresh);
    res.setHeader('x-csrf-token', payload.csrfToken);
    return { accessToken: payload.access, user: payload.user, csrfToken: payload.csrfToken };
  }

  @Post('logout')
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    if (user) await this.auth.logout(user.sub);
    res.clearCookie('refresh_token', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  me(@CurrentUser() user: any) { return user; }

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
