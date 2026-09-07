import { z } from 'zod';
export const RefreshSchema = z.object({
  csrfToken: z.string().min(16).max(128),
});
export type RefreshDto = z.infer<typeof RefreshSchema>;
