import { z } from "zod";

export const userStatsSchema = z.object({
  friendCount: z.number().min(0),
  meetsAttended: z.number().min(0),
  traitCount: z.number().min(0)
});

export type UserStats = z.infer<typeof userStatsSchema>;
