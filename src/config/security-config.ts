export function getCorsOrigins(corsOrigin: string): string[] {
  const origins = corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origins.length) {
    throw new Error('CORS_ORIGIN deve conter ao menos uma origem permitida.');
  }

  return origins;
}

export function assertProductionAuth(nodeEnv: string | undefined, requireAuth: string | undefined): void {
  if (nodeEnv === 'production' && requireAuth !== 'true') {
    throw new Error('REQUIRE_AUTH deve ser "true" em produção.');
  }
}

export function getTrustProxyHops(nodeEnv: string | undefined, value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    if (nodeEnv === 'production') {
      throw new Error('TRUST_PROXY deve ser configurado em produção.');
    }

    return 0;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('TRUST_PROXY deve ser um número inteiro entre 0 e 5.');
  }

  const hops = Number(value);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 5) {
    throw new Error('TRUST_PROXY deve ser um número inteiro entre 0 e 5.');
  }

  if (nodeEnv === 'production' && hops === 0) {
    throw new Error('TRUST_PROXY deve ser maior que zero em produção.');
  }

  return hops;
}

export type TurnstileConfig = {
  secretKey: string;
  expectedHostname: string;
};

const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

export function getTurnstileConfig(
  nodeEnv: string | undefined,
  secretKey: string | undefined,
  expectedHostname: string | undefined,
): TurnstileConfig {
  if (nodeEnv !== 'production') {
    return {
      secretKey: secretKey || TURNSTILE_TEST_SECRET_KEY,
      expectedHostname: expectedHostname || 'localhost',
    };
  }

  if (!secretKey || !expectedHostname) {
    throw new Error(
      'TURNSTILE_SECRET_KEY e TURNSTILE_EXPECTED_HOSTNAME são obrigatórios em produção.',
    );
  }

  return { secretKey, expectedHostname };
}

export function getSwaggerCredentials(
  swaggerUser: string | undefined,
  swaggerPassword: string | undefined,
): { user: string; password: string } {
  if (!swaggerUser || !swaggerPassword) {
    throw new Error('SWAGGER_USER e SWAGGER_PASSWORD são obrigatórios quando Swagger está habilitado.');
  }

  return { user: swaggerUser, password: swaggerPassword };
}
