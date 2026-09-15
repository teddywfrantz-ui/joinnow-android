import { Router } from "express";
import { db } from "@workspace/db";
import { and, eq, ne, or } from "drizzle-orm";
import { users, meetupParticipants, userTraits, traits, meetups } from "@workspace/db";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

const router = Router();

function isAuthenticated(req: any) {
  return !!req.session?.userId;
}

// Get participants to rate for a meetup
router.get("/meetups/:meetupId/participants-to-rate", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const meetupId = parseInt(req.params.meetupId);
  const currentUserId = req.session.userId;

  try {
    if (!currentUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get the meetup creator id first
    const [meetup] = await db
      .select({
        creator_id: meetups.creator_id
      })
      .from(meetups)
      .where(eq(meetups.id, meetupId))
      .limit(1);

    if (!meetup) return res.status(404).json({ error: "Meetup not found" });

    const [viewerParticipation] = await db
      .select({ id: meetupParticipants.id })
      .from(meetupParticipants)
      .where(and(
        eq(meetupParticipants.meetup_id, meetupId),
        eq(meetupParticipants.user_id, currentUserId),
      ))
      .limit(1);
    if (meetup.creator_id !== currentUserId && !viewerParticipation) {
      return res.status(403).json({ error: "You did not participate in this Meet" });
    }

    // Rules:
    // 1. Creator shouldn't see creator in ratings (exclude self)
    // 2. Creator should see participants
    // 3. Participants should see creator
    // 4. Participant shouldn't see himself
    // 5. Participant should see other participants

    const participants = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: meetupParticipants.created_at,
      })
      .from(meetupParticipants)
      .innerJoin(users, eq(users.id, meetupParticipants.user_id))
      .where(
        and(
          eq(meetupParticipants.meetup_id, meetupId),
          // 1. & 4. Exclude current user from results (no self-rating)
          ne(users.id, currentUserId),
          // Only show users that haven't been rated yet by the current user
          sql`NOT EXISTS (
            SELECT 1 FROM ${userTraits} ut 
            WHERE ut."user_id" = ${users.id}
            AND ut."endorser_id" = ${currentUserId}
            AND ut."meetup_id" = ${meetupId}
          )`
        )
      );

    if (meetup.creator_id !== currentUserId) {
      const [creator] = await db
        .select({ id: users.id, username: users.username, createdAt: meetups.createdAt })
        .from(users)
        .where(eq(users.id, meetup.creator_id!))
        .limit(1);
      if (creator && !participants.some((participant) => participant.id === creator.id)) {
        participants.unshift(creator);
      }
    }

    return res.json(participants);
  } catch (error: unknown) {
    console.error("Error fetching participants to rate:", error);
    return res.status(500).json({
      error: "Failed to fetch participants to rate",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Submit rating and trait endorsements
router.post("/meetups/:meetupId/users/:userId/rate", async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const meetupId = parseInt(req.params.meetupId);
    const userId = parseInt(req.params.userId);
    const endorserId = req.session.userId;
    if (!Number.isInteger(meetupId) || !Number.isInteger(userId) || userId === endorserId) {
      return res.status(400).json({ error: "Invalid rating target" });
    }

    const [meetup] = await db
      .select({ creatorId: meetups.creator_id })
      .from(meetups)
      .where(eq(meetups.id, meetupId))
      .limit(1);
    if (!meetup) return res.status(404).json({ error: "Meetup not found" });

    const participantRows = await db
      .select({ userId: meetupParticipants.user_id })
      .from(meetupParticipants)
      .where(eq(meetupParticipants.meetup_id, meetupId));
    const participantIds = new Set(participantRows.map((row) => row.userId));
    const canRate = meetup.creatorId === endorserId || participantIds.has(endorserId);
    const targetParticipated = meetup.creatorId === userId || participantIds.has(userId);
    if (!canRate || !targetParticipated) {
      return res.status(403).json({ error: "Ratings are limited to Meet participants" });
    }

    // Validate request body
    const ratingSchema = z.object({
      trait_name: z.string(),
      endorsement: z.number().int().min(-1).max(1), // Explicitly allow -1 or 1
    });

    const validation = ratingSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { trait_name, endorsement } = validation.data;

    // Ensure the trait exists (or create it)
    let trait = await db
      .select()
      .from(traits)
      .where(eq(traits.name, trait_name))
      .limit(1)
      .then((result) => result[0]);

    if (!trait) {
      [trait] = await db
        .insert(traits)
        .values({
          name: trait_name,
          category: "meetup",
        })
        .returning();
    }

    // Check if the user already endorsed this trait in this meetup
    const existingEndorsement = await db
      .select()
      .from(userTraits)
      .where(
        and(
          eq(userTraits.user_id, userId),
          eq(userTraits.trait_id, trait.id),
          eq(userTraits.endorser_id, endorserId),
          eq(userTraits.meetup_id, meetupId)
        )
      )
      .limit(1)
      .then((result) => result[0]);

    if (existingEndorsement) {
      // Update existing endorsement
      const [updatedEndorsement] = await db
        .update(userTraits)
        .set({
          endorsement_count: endorsement // Use the new endorsement value directly
        })
        .where(eq(userTraits.id, existingEndorsement.id))
        .returning();

      return res.json(updatedEndorsement);
    }

    // Insert new endorsement
    const [newEndorsement] = await db
      .insert(userTraits)
      .values({
        user_id: userId,
        trait_id: trait.id,
        endorser_id: endorserId,
        meetup_id: meetupId,
        endorsement_count: endorsement // Store the endorsement value directly
      })
      .returning();

    return res.json(newEndorsement);
  } catch (error: unknown) {
    console.error("Error submitting rating:", error);

    return res.status(500).json({
      error: "Failed to submit rating",
    });
  }
});

export default router;