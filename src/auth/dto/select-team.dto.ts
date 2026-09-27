import { z } from 'zod';

export const SelectTeamSchema = z.object({
  teamId: z.string().cuid(),
  teamSelectionToken: z.string().min(1).max(4096),
});

export type SelectTeamDto = z.infer<typeof SelectTeamSchema>;

export const SwitchTeamSchema = z.object({
  teamId: z.string().cuid(),
});

export type SwitchTeamDto = z.infer<typeof SwitchTeamSchema>;
