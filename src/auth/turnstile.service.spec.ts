import { ForbiddenException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const configValues: Record<string, string> = {
    NODE_ENV: 'production',
    TURNSTILE_SECRET_KEY: 'secret',
    TURNSTILE_EXPECTED_HOSTNAME: 'app.example.com',
  };
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const logger = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const service = new TurnstileService(config);

  afterEach(() => {
    fetchMock.mockReset();
    logger.mockClear();
  });

  afterAll(() => {
    fetchMock.mockRestore();
    logger.mockRestore();
  });

  it('accepts a successful token for the configured hostname', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, hostname: 'app.example.com' }),
    } as Response);

    await expect(service.verify('token', '203.0.113.1')).resolves.toBeUndefined();
  });

  it('rejects an invalid token or unexpected hostname', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, hostname: 'attacker.example.com' }),
    } as Response);

    await expect(service.verify('token', '203.0.113.1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('fails closed when the verification service is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'));

    await expect(service.verify('token', '203.0.113.1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
