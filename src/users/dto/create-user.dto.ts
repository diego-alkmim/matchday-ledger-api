import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'DIRETOR']),
  directorId: z.string().cuid().optional().nullable(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
