import { Router } from "express";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db, pushTokens } from "@workspace/db";

const router = Router();

const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10)
    .max(512)
    .regex(/^(Expo|Exponent)PushToken\[[^\]]+\]$/),
  platform: z.enum(["android", "ios"]).default("android"),
});

function currentUserId(req: any): number | null {
  const id = req.session?.userId ?? req.jwtPayload?.userId;
  return typeof id === "number" && Number.isInteger(id) ? id : null;
}

router.post("/api/push-tokens", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (userId === null) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid push token" });
    return;
  }

  try {
    const now = new Date();
    const [saved] = await db
      .insert(pushTokens)
      .values({
        user_id: userId,
        token: parsed.data.token,
        platform: parsed.data.platform,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: {
          user_id: userId,
          platform: parsed.data.platform,
          updated_at: now,
        },
      })
      .returning({
        id: pushTokens.id,
        token: pushTokens.token,
        platform: pushTokens.platform,
      });
    res.status(201).json(saved);
  } catch (error) {
    req.log.error({ err: error }, "Failed to register push token");
    res.status(500).json({ error: "Failed to register push token" });
  }
});

router.delete("/api/push-tokens/:token", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (userId === null) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = req.params.token;
  if (!token) {
    res.status(400).json({ error: "Invalid push token" });
    return;
  }
  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.user_id, userId), eq(pushTokens.token, token)));
  res.status(204).end();
});

export default router;