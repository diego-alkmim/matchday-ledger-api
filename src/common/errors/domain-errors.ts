export const domainErrors = {
  invalidCredentials: 'Credenciais inválidas',
  invalidCsrf: 'CSRF inválido',
  refreshTokenMissing: 'Refresh token não informado',
  gameNotFound: 'Jogo não encontrado',
  categoryNotFound: 'Categoria não encontrada',
  directorNotFound: 'Diretor não encontrado',
  transactionNotFound: 'Lançamento não encontrado',
  closedGameTransaction: 'Não é permitido lançar em jogo fechado',
  categoryTypeMismatch: 'Categoria incompatível com o tipo do lançamento',
  invalidDate: 'Data inválida',
  directorOnlyEntry: 'Diretor só lança entrada',
  entryRequiresDirector: 'Entrada precisa estar vinculada a um diretor',
  consolidatedEntryDirectorChange:
    'Não é permitido trocar o diretor de uma entrada já consolidada',
  invalidPayload: 'Dados inválidos',
  healthDatabaseUnavailable: 'Banco de dados indisponível',
  unexpected: 'Erro inesperado',
} as const;
