export const validationMessages = {
  required: (field: string) => `${field} é obrigatório`,
  string: (field: string) => `${field} deve ser um texto`,
  enum: (field: string, values: readonly string[]) =>
    `${field} deve ser um dos valores: ${values.join(', ')}`,
  number: (field: string) => `${field} deve ser um número válido`,
  positive: (field: string) => `${field} deve ser maior que zero`,
  boolean: (field: string) => `${field} deve ser verdadeiro ou falso`,
  dateString: (field: string) => `${field} deve ser uma data válida no formato ISO`,
  optionalDate: (field: string) => `${field} deve ser uma data válida no formato AAAA-MM-DD`,
};
