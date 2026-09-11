import { Request, Response, Router } from "express";
import { db, userTraits, traits, users } from "@workspace/db";
import { eq, desc, sql, count, and } from "drizzle-orm";
import { z } from "zod/v4";

// Create an Express router
const router = Router();

// Define the route for getting user traits
router.get('/users/:userId/traits', getUserTraits);

// Define route for endorsing a trait (positive or negative)
router.post('/users/:userId/traits/:traitId/endorse', endorseUserTrait);

// Export the router as default
export default router;

// Function to handle trait endorsements (positive or negative)
async function endorseUserTrait(req: Request, res: Response) {
  try {
    // Check if user is authenticated
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Parse and validate parameters
    const userId = parseInt(req.params.userId);
    const traitId = parseInt(req.params.traitId);
    const endorserId = req.session.userId;
    
    if (isNaN(userId) || isNaN(traitId)) {
      return res.status(400).json({ error: "Invalid user ID or trait ID" });
    }

    // Don't allow self-endorsement
    if (userId === endorserId) {
      console.warn(`Attempted self-endorsement by user ${userId} for trait ${traitId}`);
      return res.status(400).json({ error: "Cannot endorse your own traits" });
    }

    // Parse request body to get endorsement value and meetup context
    const endorsementSchema = z.object({
      meetupId: z.number(),
      endorsementValue: z.union([z.literal(1), z.literal(-1)]) // Only allow 1 or -1
    });

    const validation = endorsementSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "Invalid request body",
        details: validation.error.errors
      });
    }

    const { meetupId, endorsementValue } = validation.data;

    // Check if the trait exists
    const traitExists = await db.query.traits.findFirst({
      where: eq(traits.id, traitId)
    });

    if (!traitExists) {
      return res.status(404).json({ error: "Trait not found" });
    }

    // Check if the user has already endorsed this trait in this meetup
    const existingEndorsement = await db.query.userTraits.findFirst({
      where: and(
        eq(userTraits.user_id, userId),
        eq(userTraits.trait_id, traitId),
        eq(userTraits.endorser_id, endorserId),
        eq(userTraits.meetup_id, meetupId)
      )
    });

    if (existingEndorsement) {
      // Update existing endorsement
      const [updatedEndorsement] = await db
        .update(userTraits)
        .set({
          endorsement_count: endorsementValue // Use the new value directly
        })
        .where(eq(userTraits.id, existingEndorsement.id))
        .returning();

      // After updating, check if we need to clean up zero or negative traits
      await cleanupNegativeTraits(userId, traitId);

      return res.json({
        success: true,
        message: "Endorsement updated",
        endorsement: updatedEndorsement
      });
    }

    // Create new endorsement
    const [newEndorsement] = await db
      .insert(userTraits)
      .values({
        "user_id": userId,
        "trait_id": traitId,
        "endorser_id": endorserId,
        "meetup_id": meetupId,
        "endorsement_count": endorsementValue
      })
      .returning();

    // After creating, check if we need to clean up zero or negative traits
    await cleanupNegativeTraits(userId, traitId);

    return res.json({
      success: true,
      message: "Trait endorsed",
      endorsement: newEndorsement
    });
  } catch (error) {
    console.error("Error endorsing trait:", error);
    return res.status(500).json({ 
      error: "An error occurred while endorsing the trait",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// Helper function to remove traits with zero or negative total endorsements
async function cleanupNegativeTraits(userId: number, traitId: number) {
  try {
    // Get the current sum of endorsements for this trait
    const result = await db.execute(sql`
      SELECT SUM(endorsement_count) as total
      FROM user_traits
      WHERE user_id = ${userId} AND trait_id = ${traitId}
    `);

    // Parse the total correctly - SQL might return null, string or number
    let total = 0;
    if (result.rows && result.rows.length > 0) {
      const rawTotal = result.rows[0].total;
      if (rawTotal !== null && rawTotal !== undefined) {
        total = typeof rawTotal === 'string' ? parseInt(rawTotal) : Number(rawTotal);
      }
    }
    
    // If total is zero or negative, delete all entries for this trait
    if (total <= 0) {
      console.log(`Removing trait ${traitId} for user ${userId} as total endorsements are ${total}`);
      
      // Execute a direct SQL query for deletion to ensure it's properly processed
      const deleteResult = await db.execute(sql`
        DELETE FROM user_traits
        WHERE user_id = ${userId} AND trait_id = ${traitId}
      `);
      
      console.log(`Deletion result: ${deleteResult.rowCount} records removed`);
    }
  } catch (error) {
    console.error("Error cleaning up negative traits:", error);
  }
}

export async function getUserTraits(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Check if user exists
    const userExists = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true
      }
    });

    if (!userExists) {
      return res.status(404).json({ error: "User not found" });
    }

        // Get traits that have endorsements summing to greater than 0
    const userTraitsWithEndorsements = await db.execute(sql`
      WITH trait_endorsements AS (
        SELECT 
          ut."trait_id",
          SUM(CASE WHEN ut."endorsement_count" > 0 THEN ut."endorsement_count" ELSE 0 END) AS positive_count,
          COUNT(ut."id") AS total_votes
        FROM "user_traits" ut
        WHERE ut."user_id" = ${userId}
        GROUP BY ut."trait_id"
        HAVING SUM(ut."endorsement_count") > 0 -- Only include traits with positive total endorsements
      ),
      trait_endorsers AS (
        SELECT 
          ut."trait_id",
          array_agg(COALESCE(u."username", 'Unknown')) AS endorsers
        FROM "user_traits" ut
        LEFT JOIN "users" u ON ut."endorser_id" = u."id"
        WHERE ut."user_id" = ${userId}
        GROUP BY ut."trait_id"
      )
      SELECT 
        t."id" AS "traitId",
        t."name" AS "traitName",
        t."category" AS "traitCategory",
        COALESCE(te."positive_count", 0) AS "endorsements",
        COALESCE(te."total_votes", 0) AS "totalVotes",
        COALESCE(ter."endorsers", '{}'::text[]) AS "endorsers"
      FROM "traits" t
      JOIN trait_endorsements te ON t."id" = te."trait_id" -- Only join traits with positive endorsements
      LEFT JOIN trait_endorsers ter ON t."id" = ter."trait_id"
      GROUP BY t."id", t."name", t."category", te."positive_count", te."total_votes", ter."endorsers"
      ORDER BY "endorsements" DESC, "traitName" ASC
    `);

    // Map results to the expected structure
    const formattedTraits = userTraitsWithEndorsements.rows.map((trait: any) => {
      // Handle endorsements properly, as it might be returned in different formats
      let endorsementCount = 0;
      if (trait.endorsements) {
        if (typeof trait.endorsements === 'string') {
          endorsementCount = parseInt(trait.endorsements);
        } else if (typeof trait.endorsements === 'number') {
          endorsementCount = trait.endorsements;
        }
      }
      
      // Handle total votes count
      let totalVotes = 0;
      if (trait.totalVotes) {
        if (typeof trait.totalVotes === 'string') {
          totalVotes = parseInt(trait.totalVotes);
        } else if (typeof trait.totalVotes === 'number') {
          totalVotes = trait.totalVotes;
        }
      }
      
      return {
        traitId: trait.traitId,
        traitName: trait.traitName,
        traitCategory: trait.traitCategory,
        endorsements: endorsementCount,
        totalVotes: totalVotes,
        endorsers: trait.endorsers || []
      };
    });

    return res.status(200).json(formattedTraits);
  } catch (error) {
    console.error("Error fetching user traits:", error);
    return res.status(500).json({ error: "An error occurred while fetching user traits" });
  }
}