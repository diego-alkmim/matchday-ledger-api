import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'DIRETOR']),
  directorId: z.string().cuid().optional().nullable(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
