import {
  assertProductionAuth,
  getTurnstileConfig,
  getTrustProxyHops,
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

  it.each([undefined, 'Production', 'staging'])('rejects an unknown NODE_ENV: %s', (nodeEnv) => {
    expect(() => assertProductionAuth(nodeEnv, 'true')).toThrow('NODE_ENV');
  });

  it('uses no proxy trust during local development by default', () => {
    expect(getTrustProxyHops('development', undefined)).toBe(0);
  });

  it('requires a trusted proxy configuration in production', () => {
    expect(() => getTrustProxyHops('production', undefined)).toThrow('TRUST_PROXY');
    expect(() => getTrustProxyHops('production', '0')).toThrow('TRUST_PROXY');
  });

  it('accepts the single reverse proxy used by Render', () => {
    expect(getTrustProxyHops('production', '1')).toBe(1);
  });

  it.each(['true', '-1', '6', '1.5'])('rejects an invalid proxy hop count: %s', (value) => {
    expect(() => getTrustProxyHops('production', value)).toThrow('TRUST_PROXY');
  });

  it('uses Cloudflare test credentials locally when none are configured', () => {
    expect(getTurnstileConfig('development', undefined, undefined)).toEqual({
      secretKey: '1x0000000000000000000000000000000AA',
      expectedHostname: 'localhost',
    });
  });

  it('requires real Turnstile credentials in production', () => {
    expect(() => getTurnstileConfig('production', undefined, undefined)).toThrow(
      'TURNSTILE_SECRET_KEY',
    );
  });

  it('accepts an explicit production Turnstile configuration', () => {
    expect(getTurnstileConfig('production', 'secret', 'app.example.com')).toEqual({
      secretKey: 'secret',
      expectedHostname: 'app.example.com',
    });
  });

  it.each<[string | undefined, string | undefined]>([
    [undefined, 'senha-forte'],
    ['admin', undefined],
  ])('rejects Swagger enabled without both credentials', (user, password) => {
    expect(() => getSwaggerCredentials(user, password)).toThrow('SWAGGER_USER');
  });
});
