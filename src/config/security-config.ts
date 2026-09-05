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

export function getSwaggerCredentials(
  swaggerUser: string | undefined,
  swaggerPassword: string | undefined,
): { user: string; password: string } {
  if (!swaggerUser || !swaggerPassword) {
    throw new Error('SWAGGER_USER e SWAGGER_PASSWORD são obrigatórios quando Swagger está habilitado.');
  }

  return { user: swaggerUser, password: swaggerPassword };
}
