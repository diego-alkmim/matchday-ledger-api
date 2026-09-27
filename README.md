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
- O `Dockerfile` executa `prisma migrate deploy` antes de iniciar a API e interrompe o deploy se a migração falhar.
- Start sem Docker: `npm run prisma:deploy && npm start`
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
- O usuário é global e o papel (`ADMIN` ou `DIRETOR`) pertence ao vínculo com cada time.

## Multi-tenant
- Toda sessão possui um único time ativo. Usuários com mais de um vínculo selecionam o time após o login e podem trocá-lo pelo menu do frontend.
- Jogos, categorias, diretores, lançamentos e relatórios são isolados por `teamId` na API e por chaves compostas no banco.
- Os dados anteriores à migração são vinculados automaticamente ao time `Santa Fé` (`santa-fe`). As sessões antigas são invalidadas.

### Criar um time
O comando cria o time, vincula um administrador e inclui as categorias Diretoria, Uber, Jogador, Resenha e Arbitragem:

```bash
npm run team:create -- --name "Nome do Time" --slug nome-do-time --admin-email admin@time.com --admin-password "SenhaForte123!"
```

Se o e-mail já existir, a identidade é reutilizada e a senha informada não é alterada. A senha também pode ser fornecida por `TEAM_ADMIN_PASSWORD` para evitar registrá-la no histórico do shell.

## Contribuição dos diretores
- Cada time escolhe entre contribuição `PER_GAME` e `MONTHLY`.
- No modo por jogo, cada partida guarda seu próprio valor esperado por diretor.
- No modo mensal, existe uma obrigação por mês que possua ao menos um jogo no período consultado.
- A migração de contribuição preenche todos os jogos anteriores com o valor histórico de R$ 70,00.
- O relatório consolidado obtém os valores do banco e não aceita mais um valor manual no filtro.

## Backlog de segurança
- Avaliar Row-Level Security (RLS) no PostgreSQL como segunda camada de isolamento por time.
- A implementação deverá usar contexto transacional (`SET LOCAL`) devido ao pool de conexões, além de uma conexão administrativa separada para migrações e rotinas operacionais.
