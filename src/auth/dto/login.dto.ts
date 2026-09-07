import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});
export type LoginDto = z.infer<typeof LoginSchema>;
