import {
  assertProductionAuth,
  getSwaggerCredentials,
  getCorsOrigins,
} from './security-config';

describe('security configuration', () => {
  it('parses and normalizes the allowed CORS origins', () => {
    expect(getCorsOrigins(' https://app.example.com,https://admin.example.com ')).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('rejects an empty CORS configuration', () => {
    expect(() => getCorsOrigins(' , ')).toThrow('CORS_ORIGIN deve conter');
  });

  it.each([undefined, 'false', '1'])('rejects REQUIRE_AUTH=%s in production', (requireAuth) => {
    expect(() => assertProductionAuth('production', requireAuth)).toThrow('REQUIRE_AUTH');
  });

  it('allows development without REQUIRE_AUTH', () => {
    expect(() => assertProductionAuth('development', undefined)).not.toThrow();
  });

  it('accepts REQUIRE_AUTH=true in production', () => {
    expect(() => assertProductionAuth('production', 'true')).not.toThrow();
  });

  it.each<[string | undefined, string | undefined]>([
    [undefined, 'senha-forte'],
    ['admin', undefined],
  ])('rejects Swagger enabled without both credentials', (user, password) => {
    expect(() => getSwaggerCredentials(user, password)).toThrow('SWAGGER_USER');
  });
});
