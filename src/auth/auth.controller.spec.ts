import { BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TurnstileService } from './turnstile.service';

describe('AuthController', () => {
  it('rejects a login request without a Turnstile token before authenticating', async () => {
    const login = jest.fn();
    const verify = jest.fn();
    const auth = { login } as unknown as AuthService;
    const turnstile = { verify } as unknown as TurnstileService;
    const controller = new AuthController(auth, turnstile);

    await expect(
      controller.login(
        { email: 'admin@example.com', password: 'SenhaForte123!' },
        {} as Response,
        { ip: '203.0.113.1' } as Request,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(verify).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });
});
