import { db } from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";
import { friends, meetupParticipants, userTraits, meetHistory } from "@workspace/db";
import { z } from "zod/v4";

export const userStatsSchema = z.object({
  friendCount: z.number().min(0),
  meetsAttended: z.number().min(0),
  traitCount: z.number().min(0)
});

export type UserStats = z.infer<typeof userStatsSchema>;

export async function getUserStats(userId: number): Promise<UserStats> {
  // Get friend count
  const [{ count: friendCount }] = await db
    .select({
      count: sql<number>`COUNT(*)::int`
    })
    .from(friends)
    .where(
      or(
        eq(friends.user_id, userId),
        eq(friends.friend_id, userId)
      )
    );

  // Get meetups count
  const [{ count: meetsAttended }] = await db
    .select({
      count: sql<number>`COUNT(*)::int`
    })
    .from(meetHistory)
    .where(eq(meetHistory.user_id, userId));

  // Get total unique traits count only for traits with positive total endorsements
  const traitCountResult = await db.execute(sql`
    WITH trait_totals AS (
      SELECT 
        "trait_id",
        SUM("endorsement_count") as total_endorsement
      FROM "user_traits"
      WHERE "user_id" = ${userId}
      GROUP BY "trait_id"
      HAVING SUM("endorsement_count") > 0
    )
    SELECT COUNT(DISTINCT "trait_id")::int as count
    FROM trait_totals
  `);
  const traitCount = parseInt(traitCountResult.rows[0]?.count?.toString() || '0');

  const stats = {
    friendCount: friendCount ?? 0,
    meetsAttended: meetsAttended ?? 0,
    traitCount: traitCount ?? 0
  };

  // Validate stats before returning
  const result = userStatsSchema.safeParse(stats);
  if (!result.success) {
    throw new Error("Invalid stats data");
  }

  return result.data;
}