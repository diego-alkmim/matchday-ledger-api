export interface RefreshTokenPayload {
  sub: string;
  csrfToken: string;
  tid?: string;
}
