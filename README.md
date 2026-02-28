# Matchday Ledger API

## Rodando local
1. `cp .env.example .env` e ajuste segredos / DATABASE_URL.
2. `npm ci`
3. `npx prisma generate`
4. `npx prisma migrate dev`
5. `npx prisma db seed`
6. `npm run dev`

### Docker local
`docker compose up -d`

## Deploy Render
- Build: `npm ci && npm run build && npx prisma migrate deploy`
- Start: `node dist/main.js`
- Vars: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `COOKIE_DOMAIN`, `NODE_ENV=production`, `PORT=3001`
- Healthcheck: GET `/health`

## Segurança aplicada
- Argon2id para senha.
- JWT access 15m, refresh 14d com rotação e hash no banco.
- Refresh em cookie HttpOnly Secure (prod) SameSite=None.
- CSRF double-submit: header `x-csrf-token`.
- CORS restrito (`CORS_ORIGIN`), credentials true.
- Helmet + rate limit login/refresh.
- Prisma contra SQLi; validação Zod na borda.

## Fluxo de senha
- Atualizar senha: `prisma.user.update` com `passwordHash: await hash(nova)`.
- Novo diretor: criar Director e User `role=DIRETOR`, `directorId` associado.
