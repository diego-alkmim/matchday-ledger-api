import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { domainErrors } from '../common/errors/domain-errors';
import { getTurnstileConfig } from '../config/security-config';

type TurnstileVerificationResponse = {
  success?: boolean;
  hostname?: string;
};

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(token: string, remoteIp: string): Promise<void> {
    const { secretKey, expectedHostname } = getTurnstileConfig(
      this.config.get<string>('NODE_ENV'),
      this.config.get<string>('TURNSTILE_SECRET_KEY'),
      this.config.get<string>('TURNSTILE_EXPECTED_HOSTNAME'),
    );

    let result: TurnstileVerificationResponse;
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretKey, response: token, remoteip: remoteIp }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(`Siteverify respondeu com status ${response.status}`);
      }

      result = (await response.json()) as TurnstileVerificationResponse;
    } catch (error) {
      this.logger.warn(
        `Falha ao verificar Turnstile: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      );
      throw new ServiceUnavailableException(domainErrors.turnstileUnavailable);
    }

    if (!result.success || result.hostname !== expectedHostname) {
      this.logger.warn('Turnstile recusou a tentativa de login.');
      throw new ForbiddenException(domainErrors.turnstileInvalid);
    }
  }
}
