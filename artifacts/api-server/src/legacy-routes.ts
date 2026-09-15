import type { Express, Request, Response } from "express";
import { setupAuth } from "./auth";
import { db, meetups, users, joinRequests, meetupParticipants, notifications, messages, meetHistory, traits, userTraits, groupMembers, groups } from "@workspace/db";
import { eq, gte, and, sql, or, desc, ne } from "drizzle-orm";
import type { Session } from "express-session";
import { getUserStats } from "./services/stats";
import { getUserTraits } from "./routes/traits";
import traitsRouter from "./routes/traits";
import ratingsRouter from "./routes/ratings";
import settingsRouter from "./routes/settings";
import leaderboardsRouter from "./routes/leaderboards";
import authTestRouter from "./routes/auth-test";
import tokenTestRouter from "./routes/token-test";
import { sendPushNotification } from "./services/notifications";
import bcrypt from "bcryptjs";

// Add Express Request type with session
declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

interface AuthenticatedRequest extends Request {
  session: Session & { userId: number };
}

function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return !!(req.session && typeof req.session.userId === 'number');
}

async function getLockedGroupForUser(userId: number, queryDb: any = db) {
  const [membership] = await queryDb
    .select({
      groupId: groupMembers.group_id,
      currentMeetupId: groups.current_meetup_id,
      meetupExpiresAt: meetups.expiresAt,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.group_id, groups.id))
    .leftJoin(meetups, eq(groups.current_meetup_id, meetups.id))
    .where(
      and(
        eq(groupMembers.user_id, userId),
        sql`${groups.current_meetup_id} IS NOT NULL`,
      ),
    )
    .limit(1);
  if (!membership?.currentMeetupId) return null;
  if (membership.meetupExpiresAt && membership.meetupExpiresAt > new Date()) {
    return membership;
  }
  await queryDb
    .update(groups)
    .set({ current_meetup_id: null, updated_at: new Date() })
    .where(
      and(
        eq(groups.id, membership.groupId),
        eq(groups.current_meetup_id, membership.currentMeetupId),
      ),
    );
  return null;
}

async function lockUsers(tx: any, userIds: number[]) {
  const orderedUserIds = [...new Set(userIds)].sort((a, b) => a - b);
  if (orderedUserIds.length > 0) {
    await tx.execute(
      sql`SELECT g.id
          FROM groups g
          INNER JOIN group_members gm ON gm.group_id = g.id
          WHERE gm.user_id IN (${sql.join(
            orderedUserIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          ORDER BY g.id
          FOR UPDATE`,
    );
  }
  if (orderedUserIds.length > 0) {
    await tx.execute(
      sql`SELECT id FROM users WHERE id IN (${sql.join(
        orderedUserIds.map((id) => sql`${id}`),
        sql`, `,
      )}) ORDER BY id FOR UPDATE`,
    );
  }
}

async function lockUsersAndMeetup(
  tx: any,
  userIds: number[],
  meetupId: number,
) {
  await lockUsers(tx, userIds);
  await tx.execute(
    sql`SELECT id FROM meetups WHERE id = ${meetupId} FOR UPDATE`,
  );
}

export function registerRoutes(app: Express) {
  
  // Message reactions endpoint
  app.post("/api/messages/:messageId/reactions", async (req: Request, res: Response) => {
    try {
      const { messageId } = req.params;
      const { emoji, userId, username } = req.body;
      
      if (!emoji || !username) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      console.log(`Processing reaction ${emoji} from ${username} on message ${messageId}`);
      
      // Try to find the message by message_id first, then by id if needed
      let message;
      
      // First attempt to find using the message_id field
      message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId)
      });
      
      // If not found, try to convert to number and search by id
      if (!message) {
        const messageIdNum = parseInt(messageId, 10);
        
        if (!isNaN(messageIdNum)) {
          message = await db.query.messages.findFirst({
            where: eq(messages.id, messageIdNum)
          });
        }
      }
      
      if (!message) {
        console.error(`Message not found with ID ${messageId}`);
        return res.status(404).json({ error: 'Message not found' });
      }
      
      console.log("Found message:", message);
      
      // Initialize reactions object if it doesn't exist or isn't a valid object
      let reactions: Record<string, string[]> = {};
      
      // Carefully handle the reactions data from the database
      if (message.reactions && typeof message.reactions === 'object') {
        // Clone the existing reactions to avoid mutation issues
        reactions = JSON.parse(JSON.stringify(message.reactions));
      }
      
      console.log("Current reactions object:", reactions);
      
      // Make sure the emoji key exists
      if (!reactions[emoji]) {
        reactions[emoji] = [];
      }
      
      // Check if the user has already reacted with this emoji
      const userIndex = reactions[emoji].indexOf(username);
      let action: 'added' | 'removed';
      
      // Toggle the reaction
      if (userIndex === -1) {
        // User hasn't reacted with this emoji yet, so add reaction
        reactions[emoji].push(username);
        action = 'added';
      } else {
        // User has already reacted with this emoji, so remove reaction
        reactions[emoji].splice(userIndex, 1);
        action = 'removed';
      }
      
      // If the emoji array is empty, clean it up
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
      
      console.log("Updated reactions object:", reactions);
      
      // Update message in database
      await db.update(messages)
        .set({ 
          reactions,
          // If messageId is missing, set it now
          ...(message.messageId ? {} : { messageId: messageId })
        })
        .where(eq(messages.id, message.id));
      
      console.log(`Successfully ${action} reaction ${emoji} for ${username} on message ${messageId}`);
      
      // Return updated reactions
      res.json({ 
        success: true, 
        action,
        reactions
      });
    } catch (error) {
      console.error(`Error processing message reaction:`, error);
      console.error(error instanceof Error ? error.stack : 'Unknown error type');
      res.status(500).json({ error: "Failed to process reaction" });
    }
  });
  // Register all routes here without creating a new server
  // Keep all the route handlers but remove the server creation

  // Setup authentication routes
  setupAuth(app);
  
  // Register module routers
  app.use('/api', traitsRouter);
  app.use('/api', ratingsRouter);
  app.use('/api', settingsRouter);
  app.use('/api/leaderboards', leaderboardsRouter);
  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_TEST_ROUTES === "true") {
    app.use('/api', authTestRouter);
    app.use('/api', tokenTestRouter);
  }

  // User search endpoint is handled in server/routes/friends.ts

  // Account settings update route
  app.put('/api/users/:userId/account', async (req: Request, res: Response) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = parseInt(req.params.userId);
    
    // Verify the user is updating their own account
    if (req.session.userId !== userId) {
      return res.status(403).json({ error: 'You can only update your own account' });
    }
    
    try {
      const { email, currentPassword, newPassword } = req.body;
      
      // Get the user from the database
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
        
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Initialize update object
      const updateData: Record<string, unknown> = {};
      
      // Handle email update if provided
      if (email && email !== user.email) {
        // Check if email is already in use
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
          
        if (existingUser.length > 0 && existingUser[0].id !== userId) {
          return res.status(400).json({ error: 'Email is already in use' });
        }
        
        updateData.email = email;
      }
      
      // Handle password update if provided
      if (currentPassword && newPassword) {
        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        
        if (!isPasswordValid) {
          return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        updateData.password = hashedPassword;
      }
      
      // Update user if we have data to update
      if (Object.keys(updateData).length > 0) {
        await db
          .update(users)
          .set(updateData)
          .where(eq(users.id, userId));
          
        // Return the updated data (excluding password)
        const { password, ...userWithoutPassword } = user;
        return res.status(200).json({ 
          ...userWithoutPassword,
          ...updateData,
          password: undefined
        });
      } else {
        // Nothing to update
        return res.status(200).json({ message: 'No changes made' });
      }
    } catch (error) {
      console.error('Error updating account settings:', error);
      return res.status(500).json({ error: 'Failed to update account settings' });
    }
  });

  // Add user status endpoint right after auth setup
  app.get("/api/user-status", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = req.session.userId;

    try {
      // First check if user is a creator of any active meetup
      const [createdMeetup] = await db
        .select({
          id: meetups.id
        })
        .from(meetups)
        .where(
          and(
            eq(meetups.creator_id, userId),
            gte(meetups.expiresAt, new Date())
          )
        )
        .limit(1);

      if (createdMeetup) {
        return res.json({ activeMeetupId: createdMeetup.id });
      }

      // Then check if user is a participant in any active meetup  
      const participatingMeetup = await db
        .select({
          meetup_id: meetupParticipants.meetup_id
        })
        .from(meetupParticipants)
        .innerJoin(
          meetups,
          and(
            eq(meetupParticipants.meetup_id, meetups.id),
            gte(meetups.expiresAt, new Date())
          )
        )
        .where(eq(meetupParticipants.user_id, userId))
        .limit(1);

      if (participatingMeetup.length > 0) {
        return res.json({ activeMeetupId: participatingMeetup[0].meetup_id });
      }

      // User has no active meetup
      return res.json({ activeMeetupId: null });

    } catch (error) {
      console.error('Error getting user status:', error);
      res.status(500).json({ error: "Failed to get user status" });
    }
  });

  // Create a new meetup
  app.post("/api/meetups", async (req: Request, res: Response) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = req.session.userId;
    const { 
      title, 
      description, 
      latitude, 
      longitude, 
      exactLocation, 
      maxParticipants, 
      theme, 
      isPrivate, 
      expiresAt,
      // New demographic filter fields
      genderFilter,
      minAgeFilter,
      maxAgeFilter 
    } = req.body;

    console.log(`Creating new meetup by user ${userId}:`, {
      ...req.body,
      expiresAt: new Date(expiresAt).toISOString(),
      duration: (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60), // Duration in hours
      hasFilters: !!(genderFilter || minAgeFilter || maxAgeFilter)
    });

    try {
      return await db.transaction(async (tx) => {
      await lockUsers(tx, [userId]);
      const lockedGroup = await getLockedGroupForUser(userId, tx);
      if (lockedGroup) {
        return res.status(409).json({
          error: "Your group is already associated with a meetup. Leave that meetup before creating another one.",
        });
      }
      // Check if user already has an active meetup
      const [existingMeetup] = await tx
        .select({
          id: meetups.id
        })
        .from(meetups)
        .where(
          and(
            eq(meetups.creator_id, userId),
            gte(meetups.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existingMeetup) {
        return res.status(400).json({ error: "You already have an active meetup" });
      }

      // Check if user is participating in any active meetup
      const [existingParticipation] = await tx
        .select()
        .from(meetupParticipants)
        .innerJoin(meetups, eq(meetupParticipants.meetup_id, meetups.id))
        .where(
          and(
            eq(meetupParticipants.user_id, userId),
            gte(meetups.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existingParticipation) {
        return res.status(400).json({ error: "You are already participating in an active meetup" });
      }

      // Cancel all pending join requests from this user
      await tx
        .update(joinRequests)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(joinRequests.user_id, userId),
            eq(joinRequests.status, 'pending')
          )
        );

      // Create new meetup using the expiry time calculated by frontend
      const [newMeetup] = await tx
        .insert(meetups)
        .values({
          title,
          description,
          latitude,
          longitude,
          exactLocation,
          maxParticipants,
          theme,
          isPrivate,
          creator_id: userId,
          expiresAt: new Date(expiresAt), // Use the expiry time from frontend
          // Add demographic filters if provided
          ...(genderFilter && { genderFilter }),
          ...(minAgeFilter !== undefined && { minAgeFilter }),
          ...(maxAgeFilter !== undefined && { maxAgeFilter })
        })
        .returning();

      // Add creator as participant
      await tx
        .insert(meetupParticipants)
        .values({
          meetup_id: newMeetup.id,
          user_id: userId
        });
      // Create meetup history log for creator within the same transaction.
  await tx
        .insert(meetHistory)
        .values({
          user_id: userId,
          meetup_id: newMeetup.id,
          joined_at: new Date(),
        });

      console.log(`Successfully created meetup ${newMeetup.id}`);
      res.json(newMeetup);
      });

    } catch (error) {
      console.error('Failed to create meetup:', error);
      res.status(500).json({ error: "Failed to create meetup" });
    }
  });

  // Get all meetups
  app.get("/api/meetups", async (req: Request, res: Response) => {
    console.log("Fetching all meetups");
    try {
      // Get the current user's demographic data if authenticated
      let currentUser = null;
      if (isAuthenticated(req)) {
        currentUser = await db
          .select({
            id: users.id,
            gender: users.gender,
            birthday: users.birthday
          })
          .from(users)
          .where(eq(users.id, req.session.userId))
          .limit(1);
        
        currentUser = currentUser.length > 0 ? currentUser[0] : null;
      }
      
      // Calculate user's age if birthday exists
      let userAge = null;
      if (currentUser && currentUser.birthday) {
        const birthDate = new Date(currentUser.birthday);
        const today = new Date();
        userAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          userAge--;
        }
      }
      
      console.log(`User demographic info: ${currentUser ? `ID: ${currentUser.id}, Gender: ${currentUser.gender || 'Unknown'}, Age: ${userAge || 'Unknown'}` : 'Not authenticated'}`);
      
      // Get all active meetups with their creator, participant count, and pending request count
      const activeMeetups = await db
        .select({
          id: meetups.id,
          title: meetups.title,
          description: meetups.description,
          latitude: meetups.latitude,
          longitude: meetups.longitude,
          exactLocation: meetups.exactLocation,
          maxParticipants: meetups.maxParticipants,
          theme: meetups.theme,
          isPrivate: meetups.isPrivate,
          creator_id: meetups.creator_id,
          group_id: meetups.group_id,
          expiresAt: meetups.expiresAt,
          createdAt: meetups.createdAt,
          creator_username: sql<string | null>`CASE WHEN ${meetups.group_id} IS NOT NULL THEN ${groups.name} ELSE ${users.username} END`,
          creator_displayName: sql<string | null>`CASE WHEN ${meetups.group_id} IS NOT NULL THEN ${groups.name} ELSE ${users.displayName} END`,
          creator_group_name: groups.name,
          // Demographic filter fields
          genderFilter: meetups.genderFilter,
          minAgeFilter: meetups.minAgeFilter,
          maxAgeFilter: meetups.maxAgeFilter,
          participantCount: sql<number>`(
            SELECT COUNT(DISTINCT mp.user_id)
            FROM ${meetupParticipants} mp 
            WHERE mp.meetup_id = ${meetups.id}
          )`.mapWith(Number),
          pendingRequestCount: sql<number>`(
            SELECT COUNT(DISTINCT jr.id)
            FROM ${joinRequests} jr
            WHERE jr.meetup_id = ${meetups.id}
            AND jr.status = 'pending'
          )`.mapWith(Number)
        })
        .from(meetups)
        .leftJoin(users, eq(meetups.creator_id, users.id))
        .leftJoin(groups, eq(meetups.group_id, groups.id))
        .where(gte(meetups.expiresAt, new Date()))
        .orderBy(meetups.createdAt);

      // Filter out meetups that the user doesn't qualify for based on demographic filters
      const filteredMeetups = activeMeetups.filter(meetup => {
        // Create a debugging message for this specific meetup filter decision
        let filterReasons: string[] = [];
        
        // If no authenticated user, show all meetups regardless of demographic filters
        // This allows visitors to see the full range of available meetups
        if (!currentUser) {
          // Always show all meetups to unauthenticated users
          filterReasons.push("No user logged in, showing all meetups to encourage sign up");
          return true;
        }
        
        // Creators can always see their own meetups
        if (meetup.creator_id === currentUser.id) {
          filterReasons.push("Creator can always see their own meetup");
          return true;
        }
        
        // Check gender filter if it exists and is not "All"
        if (meetup.genderFilter && meetup.genderFilter !== 'All') {
          // If user doesn't have a gender set or it doesn't match, filter out
          if (!currentUser.gender || currentUser.gender !== meetup.genderFilter) {
            filterReasons.push(`Gender filter mismatch: Meetup requires ${meetup.genderFilter}, user is ${currentUser.gender || 'unspecified'}`);
            return false;
          }
        }
        
        // Check age filters if they exist
        if ((meetup.minAgeFilter || meetup.maxAgeFilter) && userAge === null) {
          // User doesn't have a birthday set, filter out meetups with age restrictions
          filterReasons.push("User has no birthdate but meetup has age restrictions");
          return false;
        }
        
        if (meetup.minAgeFilter && userAge !== null && userAge < meetup.minAgeFilter) {
          filterReasons.push(`User age ${userAge} is below minimum age ${meetup.minAgeFilter}`);
          return false;
        }
        
        if (meetup.maxAgeFilter && userAge !== null && userAge > meetup.maxAgeFilter) {
          filterReasons.push(`User age ${userAge} is above maximum age ${meetup.maxAgeFilter}`);
          return false;
        }
        
        // Detailed logging for debugging specific meetup filtering decisions
        if (filterReasons.length > 0) {
          console.log(`Meetup ${meetup.id} "${meetup.title}" filtered out: ${filterReasons.join(', ')}`);
        }
        
        return true;
      });
      
      console.log(`Filtered from ${activeMeetups.length} to ${filteredMeetups.length} meetups based on demographic filters`);

      // Clean up participants from expired meetups
      await db
        .delete(meetupParticipants)
        .where(
          sql`EXISTS (
            SELECT 1 FROM ${meetups} m 
            WHERE m.id = ${meetupParticipants.meetup_id} 
            AND m.expires_at <= NOW()
          )`
        );

      // Cancel pending requests for expired meetups
      await db
        .update(joinRequests)
        .set({ status: 'cancelled' })
        .where(
          sql`EXISTS (
            SELECT 1 FROM ${meetups} m 
            WHERE m.id = ${joinRequests.meetup_id} 
            AND m.expires_at <= NOW()
          )`
        );

      console.log("Successfully fetched meetups");
      res.json(filteredMeetups);
    } catch (error) {
      console.error('Failed to fetch meetups:', error);
      res.status(500).json({ error: "Failed to fetch meetups" });
    }
  });

  // Get a single meetup
  app.get("/api/meetups/:meetupId", async (req, res) => {
    const meetupId = parseInt(req.params.meetupId);
    console.log(`Fetching meetup ${meetupId}`);
    try {
      const [meetup] = await db
        .select({
          id: meetups.id,
          title: meetups.title,
          description: meetups.description,
          latitude: meetups.latitude,
          longitude: meetups.longitude,
          exactLocation: meetups.exactLocation,
          maxParticipants: meetups.maxParticipants,
          theme: meetups.theme,
          isPrivate: meetups.isPrivate,
          creator_id: meetups.creator_id,
          group_id: meetups.group_id,
          expiresAt: meetups.expiresAt,
          createdAt: meetups.createdAt,
          creator_username: sql<string | null>`CASE WHEN ${meetups.group_id} IS NOT NULL THEN ${groups.name} ELSE ${users.username} END`,
          creator_displayName: sql<string | null>`CASE WHEN ${meetups.group_id} IS NOT NULL THEN ${groups.name} ELSE ${users.displayName} END`,
          creator_group_name: groups.name,
          // Demographic filter fields
          genderFilter: meetups.genderFilter,
          minAgeFilter: meetups.minAgeFilter,
          maxAgeFilter: meetups.maxAgeFilter,
          participantCount: sql<number>`(
            SELECT COUNT(DISTINCT mp.user_id)
            FROM ${meetupParticipants} mp 
            WHERE mp.meetup_id = ${meetups.id}
          )`.mapWith(Number),
          pendingRequestCount: sql<number>`(
            SELECT COUNT(DISTINCT jr.id)
            FROM ${joinRequests} jr
            WHERE jr.meetup_id = ${meetups.id}
            AND jr.status = 'pending'
          )`.mapWith(Number)
        })
        .from(meetups)
        .leftJoin(users, eq(meetups.creator_id, users.id))
        .leftJoin(groups, eq(meetups.group_id, groups.id))
        .where(eq(meetups.id, meetupId))
        .limit(1);

      if (!meetup) {
        console.log(`Meetup ${meetupId} not found`);
        return res.status(404).json({ error: "Meetup not found" });
      }

      // Check if user qualifies for this meetup's demographic filters
      if (meetup.genderFilter || meetup.minAgeFilter || meetup.maxAgeFilter) {
        // Get current user if authenticated
        let currentUser = null;
        let userAge = null;
        
        if (isAuthenticated(req)) {
          const userResult = await db
            .select({
              id: users.id,
              gender: users.gender,
              birthday: users.birthday
            })
            .from(users)
            .where(eq(users.id, req.session.userId))
            .limit(1);
          
          currentUser = userResult.length > 0 ? userResult[0] : null;
          
          // Calculate user's age if birthday exists
          if (currentUser && currentUser.birthday) {
            const birthDate = new Date(currentUser.birthday);
            const today = new Date();
            userAge = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
              userAge--;
            }
          }
        }

        // Check if the user qualifies based on demographics
        let userQualifies = true;
        
        // If no authenticated user, show all meetups regardless of demographic filters
        // This allows visitors to see the full range of available meetups
        if (!currentUser) {
          userQualifies = true;
        } else {
          // Check if current user is the creator (creators can always see their own meetups)
          if (currentUser.id === meetup.creator_id) {
            userQualifies = true;
          } else {
            // Check gender filter if it exists and is not "All"
            if (meetup.genderFilter && meetup.genderFilter !== 'All') {
              // If user doesn't have a gender set or it doesn't match, filter out
              if (!currentUser.gender || currentUser.gender !== meetup.genderFilter) {
                userQualifies = false;
              }
            }
            
            // Check age filters if they exist
            if ((meetup.minAgeFilter || meetup.maxAgeFilter) && userAge === null) {
              // User doesn't have a birthday set, filter out meetups with age restrictions
              userQualifies = false;
            }
            
            if (meetup.minAgeFilter && userAge !== null && userAge < meetup.minAgeFilter) {
              userQualifies = false;
            }
            
            if (meetup.maxAgeFilter && userAge !== null && userAge > meetup.maxAgeFilter) {
              userQualifies = false;
            }
          }
        }
        
        // If user doesn't qualify, return a 403 Forbidden status
        if (!userQualifies) {
          console.log(`User does not qualify for meetup ${meetupId} due to demographic filters`);
          return res.status(403).json({ 
            error: "You do not meet the demographic requirements for this meetup"
          });
        }
      }

      console.log(`Successfully fetched meetup ${meetupId}`);
      res.json(meetup);
    } catch (error) {
      console.error('Failed to fetch meetup:', error);
      res.status(500).json({ error: "Failed to fetch meetup" });
    }
  });

  // Get participants for a meetup
  app.get("/api/meetups/:meetupId/participants", async (req, res) => {
    const meetupId = parseInt(req.params.meetupId);
    const forRating = req.query.for === 'rating';
    const currentUserId = req.session?.userId;
    
    console.log(`Fetching participants for meetup ${meetupId}${forRating ? ' (for rating)' : ''}`);
    console.log(`Current user ID: ${currentUserId || 'None (not logged in)'}`);
    
    try {
      if (forRating && currentUserId) {
        console.log(`Fetching participants for rating from meet history`);
        
        // For the rating feature, we need to get participants from meet_history 
        // since the meetup has ended and participants have been removed from the active participants table
        const historyParticipants = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profilePicture: users.profilePicture,
            createdAt: meetHistory.joined_at
          })
          .from(meetHistory)
          .innerJoin(users, eq(meetHistory.user_id, users.id))
          .where(
            and(
              eq(meetHistory.meetup_id, meetupId),
              ne(users.id, currentUserId) // Exclude current user
            )
          )
          .orderBy(meetHistory.joined_at);
          
        console.log(`Successfully fetched ${historyParticipants.length} history participants for meetup ${meetupId}`);
        console.log(`History participant details:`, historyParticipants);
        return res.json(historyParticipants);
      }
      
      // Build the where conditions for normal participant fetching
      const whereConditions = [];
      whereConditions.push(eq(meetupParticipants.meetup_id, meetupId));
      
      const participants = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          profilePicture: users.profilePicture,
          createdAt: meetupParticipants.created_at
        })
        .from(meetupParticipants)
        .innerJoin(users, eq(meetupParticipants.user_id, users.id))
        .where(and(...whereConditions))
        .orderBy(meetupParticipants.created_at);

      console.log(`Successfully fetched ${participants.length} participants for meetup ${meetupId}`);
      console.log(`Participant details:`, participants);
      res.json(participants);
    } catch (error) {
      console.error('Failed to fetch participants:', error);
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });

  // Join a meetup
  app.post("/api/meetups/:meetupId/join", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const meetupId = parseInt(req.params.meetupId);
    const userId = req.session.userId;
    const { message } = req.body;

    console.log(`User ${userId} attempting to join meetup ${meetupId}`);

    try {
      const newRequest = await db.transaction(async (tx) => {
      await lockUsersAndMeetup(tx, [userId], meetupId);
      const lockedGroup = await getLockedGroupForUser(userId, tx);
      if (lockedGroup) {
        return res.status(409).json({
          error: "Your group is already associated with a meetup. Leave that meetup before joining another one.",
        });
      }
      // First clean up any stale requests
      await tx
        .delete(joinRequests)
        .where(
          and(
            eq(joinRequests.user_id, userId),
            or(
              eq(joinRequests.status, 'cancelled'),
              sql`EXISTS (
                SELECT 1 FROM ${meetups} m 
                WHERE m.id = ${joinRequests.meetup_id} 
                AND m.expires_at <= NOW()
              )`
            )
          )
        );

      // Check if user is already in any active meetup
      const existingParticipation = await tx
        .select()
        .from(meetupParticipants)
        .innerJoin(meetups, eq(meetupParticipants.meetup_id, meetups.id))
        .where(
          and(
            eq(meetupParticipants.user_id, userId),
            gte(meetups.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existingParticipation.length > 0) {
        return res.status(400).json({
          error: "You are already participating in an active meet. In order to join a meet please leave your current one."
        });
      }

      // Get meetup details with demographic filters
      const [meetup] = await tx
        .select({
          id: meetups.id,
          title: meetups.title,
          creator_id: meetups.creator_id,
          expiresAt: meetups.expiresAt,
          genderFilter: meetups.genderFilter,
          minAgeFilter: meetups.minAgeFilter,
          maxAgeFilter: meetups.maxAgeFilter
        })
        .from(meetups)
        .where(eq(meetups.id, meetupId))
        .limit(1);

      if (!meetup) {
        console.log(`Meetup ${meetupId} not found`);
        return res.status(404).json({ error: "Meet not found" });
      }

      if (new Date(meetup.expiresAt) <= new Date()) {
        return res.status(400).json({ error: "This meet has expired" });
      }
      
      // Check if user meets the demographic requirements
      if (meetup.genderFilter || meetup.minAgeFilter || meetup.maxAgeFilter) {
        // Get user's demographic data
        const [userData] = await tx
          .select({
            gender: users.gender,
            birthday: users.birthday
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        
        // Calculate user's age if birthday exists
        let userAge = null;
        if (userData && userData.birthday) {
          const birthDate = new Date(userData.birthday);
          const today = new Date();
          userAge = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            userAge--;
          }
        }
        
        // Check gender filter if it exists and is not "All"
        if (meetup.genderFilter && meetup.genderFilter !== 'All') {
          if (!userData || !userData.gender || userData.gender !== meetup.genderFilter) {
            return res.status(403).json({ 
              error: "You do not meet the gender requirements for this meetup" 
            });
          }
        }
        
        // Check age filters if they exist
        // Now we'll keep this requirement for joining (not viewing) age-restricted meetups
        // This is intentional - for viewing we're more lenient, but for joining we require birthdate
        if ((meetup.minAgeFilter || meetup.maxAgeFilter) && userAge === null) {
          return res.status(403).json({ 
            error: "You need to set your birthday to join this age-restricted meetup" 
          });
        }
        
        if (meetup.minAgeFilter && userAge !== null && userAge < meetup.minAgeFilter) {
          return res.status(403).json({ 
            error: `This meetup requires participants to be at least ${meetup.minAgeFilter} years old` 
          });
        }
        
        if (meetup.maxAgeFilter && userAge !== null && userAge > meetup.maxAgeFilter) {
          return res.status(403).json({ 
            error: `This meetup requires participants to be no older than ${meetup.maxAgeFilter} years old` 
          });
        }
      }

      // Check if user already has a pending request
      const existingRequest = await tx
        .select()
        .from(joinRequests)
        .where(
          and(
            eq(joinRequests.meetup_id, meetupId),
            eq(joinRequests.user_id, userId),
            eq(joinRequests.status, 'pending')
          )
        )
        .limit(1);

      if (existingRequest.length > 0) {
        return res.status(400).json({ error: "Request already pending" });
      }

      const [requester] = await tx
        .select({
          username: users.username
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Create new request
      const [newRequest] = await tx
        .insert(joinRequests)
        .values({
          meetup_id: meetupId,
          user_id: userId,
          status: 'pending',
          message: message || "I'd like to join your meet!"
        })
        .returning();

      // Create notification for meetup creator
      await tx
        .insert(notifications)
        .values({
          user_id: meetup.creator_id,
          title: "New Join Request",
          message: `${requester.username} has requested to join your meet "${meetup.title}"`,
          type: 'info',
          relatedId: newRequest.id,
          link: '/active-meet'
        });
      void sendPushNotification(meetup.creator_id, {
        title: "New Join Request",
        message: `${requester.username} has requested to join your meet "${meetup.title}"`,
        link: "/active-meet",
      });

      console.log(`Successfully created join request ${newRequest.id} for meetup ${meetupId}`);
      return newRequest;
      });
      return res.json(newRequest);
    } catch (error) {
      console.error('Failed to create join request:', error);
      res.status(500).json({ error: "Failed to create join request" });
    }
  });

  // Get join requests for a meetup
  app.get("/api/meetups/:meetupId/requests", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const meetupId = parseInt(req.params.meetupId);
    console.log(`Fetching join requests for meetup ${meetupId}`);

    try {
      const meetup = await db
        .select()
        .from(meetups)
        .where(eq(meetups.id, meetupId))
        .limit(1);

      if (!meetup[0]) {
        console.log(`Meetup ${meetupId} not found`);
        return res.status(404).json({ error: "Meetup not found" });
      }

      // Only allow creator to view requests
      if (meetup[0].creator_id !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const requests = await db
        .select({
          id: joinRequests.id,
          status: joinRequests.status,
          message: joinRequests.message,
          createdAt: joinRequests.createdAt,
          username: users.username,
          displayName: users.displayName,
          user_id: users.id,
          profilePicture: users.profilePicture
        })
        .from(joinRequests)
        .leftJoin(users, eq(joinRequests.user_id, users.id))
        .where(
          and(
            eq(joinRequests.meetup_id, meetupId),
            eq(joinRequests.status, 'pending')
          )
        );

      console.log(`Successfully fetched join requests for meetup ${meetupId}`);
      res.json(requests);
    } catch (error) {
      console.error('Failed to get join requests:', error);
      res.status(500).json({ error: "Failed to get join requests" });
    }
  });

  // Get my pending request for a meetup
  app.get("/api/meetups/:meetupId/my-request", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const meetupId = parseInt(req.params.meetupId);
      const userId = req.session.userId;
      console.log(`Fetching pending request for user ${userId} and meetup ${meetupId}`);

      // Get user's pending request for this meetup
      const [request] = await db
        .select({
          id: joinRequests.id,
          status: joinRequests.status,
          message: joinRequests.message,
          createdAt: joinRequests.createdAt,
          meetup_id: joinRequests.meetup_id,
          user_id: joinRequests.user_id
        })
        .from(joinRequests)
        .where(
          and(
            eq(joinRequests.meetup_id, meetupId),
            eq(joinRequests.user_id, userId),
            eq(joinRequests.status, 'pending')
          )
        )
        .limit(1);

      if (!request) {
        console.log(`No pending request found for user ${userId} and meetup ${meetupId}`);
        return res.status(404).json({ error: "No pending request found" });
      }

      console.log(`Successfully fetched pending request ${request.id}`);
      res.json(request);
    } catch (error) {
      console.error('Failed to fetch pending request:', error);
      res.status(500).json({ error: "Failed to fetch pending request" });
    }
  });

  // Get all pending requests for current user
  app.get("/api/pending-requests", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.session.userId;
      console.log(`Fetching all pending requests for user ${userId}`);

      // Get all pending requests for this user
      const pendingRequests = await db
        .select({
          id: joinRequests.id,
          meetupId: joinRequests.meetup_id,
          status: joinRequests.status,
          message: joinRequests.message,
          createdAt: joinRequests.createdAt,
          meetupTitle: meetups.title
        })
        .from(joinRequests)
        .innerJoin(meetups, eq(joinRequests.meetup_id, meetups.id))
        .where(
          and(
            eq(joinRequests.user_id, userId),
            eq(joinRequests.status, 'pending')
          )
        )
        .orderBy(joinRequests.createdAt);

      console.log(`Found ${pendingRequests.length} pending requests`);
      res.json(pendingRequests);
    } catch (error) {
      console.error('Failed to fetch pending requests:', error);
      res.status(500).json({ error: "Failed to fetch pending requests" });
    }
  });

  // Get my pending requests for meetups
  app.get("/api/my-pending-requests", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.session.userId;
      console.log(`Fetching pending meetup requests for user ${userId}`);

      // Get pending join requests with meetup details
      const pendingRequests = await db
        .select({
          id: joinRequests.id,
          meetup_id: joinRequests.meetup_id,
          status: joinRequests.status,
          message: joinRequests.message,
          createdAt: joinRequests.createdAt,
          meetupTitle: meetups.title,
          meetupTheme: meetups.theme,
          meetupExpiresAt: meetups.expiresAt
        })
        .from(joinRequests)
        .innerJoin(meetups, eq(joinRequests.meetup_id, meetups.id))
        .where(
          and(
            eq(joinRequests.user_id, userId),
            eq(joinRequests.status, 'pending'),
            gte(meetups.expiresAt, new Date()) // Only include active meetups
          )
        )
        .orderBy(joinRequests.createdAt);

      console.log(`Found ${pendingRequests.length} pending meetup requests`);
      res.json(pendingRequests);
    } catch (error) {
      console.error('Failed to fetch pending meetup requests:', error);
      res.status(500).json({ error: "Failed to fetch pending meetup requests" });
    }
  });

  // Add DELETE endpoint for canceling requests right after the my-request endpoint
  app.delete("/api/meetups/:meetupId/requests/:requestId", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const meetupId = parseInt(req.params.meetupId);
    const requestId = parseInt(req.params.requestId);
    const userId = req.session.userId;
    console.log(`Attempting to cancel request ${requestId} by user ${userId} for meetup ${meetupId}`);

    try {
      // Get the request to verify ownership
      const [request] = await db
        .select()
        .from(joinRequests)
        .where(
          and(
            eq(joinRequests.id, requestId),
            eq(joinRequests.meetup_id, meetupId),
            eq(joinRequests.user_id, userId),
            eq(joinRequests.status, 'pending')
          )
        )
        .limit(1);

      if (!request) {
        console.log(`Request ${requestId} not found`);
        return res.status(404).json({ error: "Request not found" });
      }

      // Update request status to cancelled
      const [cancelledRequest] = await db
        .update(joinRequests)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(joinRequests.id, requestId),
            eq(joinRequests.meetup_id, meetupId),
            eq(joinRequests.user_id, userId),
            eq(joinRequests.status, 'pending'),
          ),
        )
        .returning();
      if (!cancelledRequest) {
        return res.status(409).json({ error: "Request is no longer pending" });
      }

      console.log(`Successfully cancelled request ${requestId}`);
      res.json({ message: "Request cancelled successfully" });
    } catch (error) {
      console.error('Failed to cancel request:', error);
      res.status(500).json({ error: "Failed to cancel request" });
    }
  });

  // Handle join request (accept/reject)
  app.post("/api/meetups/:meetupId/requests/:requestId", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { status } = req.body;
    if (!status || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const meetupId = parseInt(req.params.meetupId);
    const requestId = parseInt(req.params.requestId);
    console.log(`Handling request ${requestId} for meetup ${meetupId} with status ${status}`);

    try {
      // First check if the request still exists and get the user_id
      const [request] = await db
        .select({
          id: joinRequests.id,
          user_id: joinRequests.user_id,
          meetup_id: joinRequests.meetup_id,
          status: joinRequests.status
        })
        .from(joinRequests)
        .where(eq(joinRequests.id, requestId))
        .limit(1);

      if (!request) {
        console.log(`Request ${requestId} not found`);
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ error: "Request is no longer pending" });
      }
      if (request.meetup_id !== meetupId) {
        return res.status(404).json({ error: "Request not found for this meetup" });
      }

      // Get meetup details including current participant count
      const [meetup] = await db
        .select({
          id: meetups.id,
          title: meetups.title,
          creator_id: meetups.creator_id,
          expiresAt: meetups.expiresAt,
          maxParticipants: meetups.maxParticipants,
          participantCount: sql<number>`(
            SELECT COUNT(DISTINCT mp.user_id)
            FROM ${meetupParticipants} mp 
            WHERE mp.meetup_id = ${meetups.id}
          )`.mapWith(Number)
        })
        .from(meetups)
        .where(eq(meetups.id, meetupId))
        .limit(1);

      if (!meetup) {
        console.log(`Meetup ${meetupId} not found`);
        return res.status(404).json({ error: "Meetup not found" });
      }

      // Check if meetup is expired
      if (new Date(meetup.expiresAt) <= new Date()) {
        // Auto-reject the request if meetup is expired
        await db
          .update(joinRequests)
          .set({ status: 'rejected' })
            .where(
              and(
                eq(joinRequests.id, requestId),
                eq(joinRequests.meetup_id, meetupId),
                eq(joinRequests.status, 'pending'),
              ),
            );

        return res.status(400).json({
          error: "This meetup has expired",
          status: 'rejected'
        });
      }

      // Only allow creator to handle requests
      if (meetup.creator_id !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (status === 'accepted') {
        const acceptance = await db.transaction(async (tx) => {
          await lockUsersAndMeetup(tx, [request.user_id], meetupId);
          const [lockedRequest] = await tx
            .select()
            .from(joinRequests)
            .where(
              and(
                eq(joinRequests.id, requestId),
                eq(joinRequests.meetup_id, meetupId),
                eq(joinRequests.status, 'pending'),
              ),
            )
            .limit(1);
          if (!lockedRequest) {
            return { statusCode: 409, error: "Request is no longer pending" };
          }
          const [lockedMeetup] = await tx
            .select({
              title: meetups.title,
              expiresAt: meetups.expiresAt,
              maxParticipants: meetups.maxParticipants,
              participantCount: sql<number>`(
                SELECT COUNT(DISTINCT mp.user_id)
                FROM ${meetupParticipants} mp
                WHERE mp.meetup_id = ${meetups.id}
              )`.mapWith(Number),
            })
            .from(meetups)
            .where(eq(meetups.id, meetupId))
            .limit(1);
          if (!lockedMeetup) return { statusCode: 404, error: "Meetup not found" };
          if (new Date(lockedMeetup.expiresAt) <= new Date()) {
            await tx
              .update(joinRequests)
              .set({ status: 'rejected' })
              .where(
                and(
                  eq(joinRequests.id, requestId),
                  eq(joinRequests.status, 'pending'),
                ),
              );
            return { statusCode: 400, error: "This meetup has expired", status: 'rejected' };
          }
          if (lockedMeetup.participantCount >= lockedMeetup.maxParticipants) {
            return {
              statusCode: 400,
              error: "This meetup is full. Cannot accept more participants.",
              status: 'pending',
            };
          }
          const [lockedGroup] = await tx
            .select({ currentMeetupId: groups.current_meetup_id, expiresAt: meetups.expiresAt })
            .from(groupMembers)
            .innerJoin(groups, eq(groupMembers.group_id, groups.id))
            .leftJoin(meetups, eq(groups.current_meetup_id, meetups.id))
            .where(eq(groupMembers.user_id, request.user_id))
            .limit(1);
          if (
            lockedGroup?.currentMeetupId &&
            lockedGroup.expiresAt &&
            lockedGroup.expiresAt > new Date()
          ) {
            await tx
              .update(joinRequests)
              .set({ status: 'rejected' })
              .where(
                and(
                  eq(joinRequests.id, requestId),
                  eq(joinRequests.status, 'pending'),
                ),
              );
            return {
              statusCode: 409,
              error: "This user belongs to a group that is already associated with a meetup",
              status: 'rejected',
            };
          }
          const existingParticipation = await tx
            .select()
            .from(meetupParticipants)
            .innerJoin(meetups, and(
              eq(meetupParticipants.meetup_id, meetups.id),
              gte(meetups.expiresAt, new Date()),
            ))
            .where(eq(meetupParticipants.user_id, request.user_id))
            .limit(1);
          if (existingParticipation.length > 0) {
            await tx
              .update(joinRequests)
              .set({ status: 'rejected' })
              .where(
                and(
                  eq(joinRequests.id, requestId),
                  eq(joinRequests.status, 'pending'),
                ),
              );
            await tx.insert(notifications).values({
              user_id: request.user_id,
              title: "Join Request Rejected",
              message: `Your request to join ${lockedMeetup.title} was rejected because you are already in another meet.`,
              type: 'warning',
            });
            void sendPushNotification(request.user_id, {
              title: "Join Request Rejected",
              message: `Your request to join ${lockedMeetup.title} was rejected because you are already in another meet.`,
            });
            return {
              statusCode: 400,
              error: "User is already participating in another meet",
              status: 'rejected',
            };
          }
          await tx
            .update(joinRequests)
            .set({ status: 'cancelled' })
            .where(
              and(
                eq(joinRequests.user_id, request.user_id),
                eq(joinRequests.status, 'pending'),
                ne(joinRequests.id, requestId),
              ),
            );
          await tx.insert(meetupParticipants).values({
            meetup_id: meetupId,
            user_id: request.user_id,
          });
          await tx.insert(meetHistory).values({
            user_id: request.user_id,
            meetup_id: meetupId,
            joined_at: new Date(),
          });
          await tx.insert(notifications).values({
            user_id: request.user_id,
            title: "Join Request Accepted",
            message: `Your request to join ${lockedMeetup.title} has been accepted!`,
            type: 'success',
            link: '/active-meet',
          });
            void sendPushNotification(request.user_id, {
            title: "Join Request Accepted",
            message: `Your request to join ${lockedMeetup.title} has been accepted!`,
            link: "/active-meet",
          });
          const [acceptedRequest] = await tx
            .update(joinRequests)
            .set({ status: 'accepted' })
            .where(
              and(
                eq(joinRequests.id, requestId),
                eq(joinRequests.status, 'pending'),
              ),
            )
            .returning();
          if (!acceptedRequest) return { statusCode: 409, error: "Request is no longer pending" };
          return { statusCode: 200, status: 'accepted' };
        });
        if (acceptance.statusCode !== 200) {
          return res.status(acceptance.statusCode).json({
            error: acceptance.error,
            status: acceptance.status,
          });
        }
        return res.json({ message: "Request accepted", status: "accepted" });
      } else {
        // Create notification for rejected request
        await db
          .insert(notifications)
          .values({
            user_id: request.user_id,
            title: "Join Request Rejected",
            message: `Your request to join ${meetup.title} was rejected.`,
            type: 'warning'
          });
            void sendPushNotification(request.user_id, {
          title: "Join Request Rejected",
          message: `Your request to join ${meetup.title} was rejected.`,
        });
      }

      // Update request status only while it is still pending.
      const [updatedRequest] = await db
        .update(joinRequests)
        .set({ status })
        .where(
          and(
            eq(joinRequests.id, requestId),
            eq(joinRequests.meetup_id, meetupId),
            eq(joinRequests.status, 'pending'),
          ),
        )
        .returning();
      if (!updatedRequest) {
        return res.status(409).json({ error: "Request is no longer pending" });
      }

      console.log(`Successfully handled request ${requestId} with status ${status}`);
      res.json({ message: `Request ${status}`, status });
    } catch (error) {
      console.error('Failed to handle join request:', error);
      res.status(500).json({ error: "Failed to handle join request" });
    }
  });

  // Update the messages route to use correct column names
  app.get("/api/meetups/:meetupId/messages", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const meetupId = parseInt(req.params.meetupId);
      const [meetupAccess] = await db
        .select({ creatorId: meetups.creator_id })
        .from(meetups)
        .where(eq(meetups.id, meetupId))
        .limit(1);
      const [participantAccess] = await db
        .select({ id: meetupParticipants.id })
        .from(meetupParticipants)
        .where(and(eq(meetupParticipants.meetup_id, meetupId), eq(meetupParticipants.user_id, req.session.userId)))
        .limit(1);
      const [historyAccess] = await db
        .select({ id: meetHistory.id })
        .from(meetHistory)
        .where(
          and(
            eq(meetHistory.meetup_id, meetupId),
            eq(meetHistory.user_id, req.session.userId),
          ),
        )
        .limit(1);
      if (
        !meetupAccess ||
        (
          meetupAccess.creatorId !== req.session.userId &&
          !participantAccess &&
          !historyAccess
        )
      ) {
        return res.status(403).json({ error: "You are not a participant in this meetup" });
      }
      console.log(`Fetching messages for meetup ${meetupId}`);

      // Get all messages for the meetup with reactions column included
      const meetupMessages = await db.execute(sql`
        SELECT 
          m.id, 
          m.content, 
          m.user_id as "userId", 
          u.username,
          u.display_name as "displayName",
          u.profile_picture as "profilePicture",
          m.created_at as "createdAt",
          m.message_id as "messageId",
          m.reactions
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.meetup_id = ${meetupId}
          AND (
            ${meetupAccess.creatorId === req.session.userId || Boolean(participantAccess)}
            OR EXISTS (
              SELECT 1
              FROM meet_history history
              WHERE history.meetup_id = m.meetup_id
                AND history.user_id = ${req.session.userId}
                AND m.created_at >= history.joined_at
                AND (
                  history.left_at IS NULL
                  OR m.created_at <= history.left_at
                )
            )
          )
        ORDER BY m.created_at ASC
      `);
      
      const messageRows = meetupMessages.rows || [];
      
      // Process messages to ensure they have proper reaction objects
      console.log("Raw message rows before processing:", 
                 messageRows.map(msg => ({id: msg.id, hasReactions: !!msg.reactions, reactionsType: typeof msg.reactions})));
      
      const processedMessages = messageRows.map(msg => {
        // Check if message has messageId, if not, use the ID as string
        const messageId = msg.messageId || String(msg.id);
        
        // Process reactions object - ensure it's a valid JSON object
        let reactions = {};
        if (msg.reactions) {
          try {
            // If reactions is already an object, use it as is
            if (typeof msg.reactions === 'object') {
              console.log(`Message ${messageId} has reactions as object:`, msg.reactions);
              reactions = msg.reactions;
            } 
            // If it's a JSON string, parse it
            else if (typeof msg.reactions === 'string') {
              console.log(`Message ${messageId} has reactions as string, parsing:`, msg.reactions);
              reactions = JSON.parse(msg.reactions);
            }
          } catch (error) {
            console.error(`Failed to parse reactions for message ${messageId}:`, error);
          }
        }
        
        // Debug the final reactions object
        console.log(`Final processed reactions for message ${messageId}:`, reactions);
        
        // Return processed message with proper format
        return {
          ...msg,
          messageId,
          reactions
        };
      });

      console.log(`Successfully fetched ${processedMessages.length} messages for meetup ${meetupId}`);
      res.json(processedMessages);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Extend meetup duration
  app.post("/api/meetups/:meetupId/extend", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const meetupId = parseInt(req.params.meetupId);
    const userId = req.session.userId;
    const { hours } = req.body; // Get the hours to extend from request body

    if (!hours || typeof hours !== 'number' || hours <= 0) {
      return res.status(400).json({ error: "Invalid hours value" });
    }

    console.log(`Attempting to extend meetup ${meetupId} by ${hours} hours`);

    try {
      // Get the meetup and verify ownership
      const [meetup] = await db
        .select()
        .from(meetups)
        .where(
          and(
            eq(meetups.id, meetupId),
            eq(meetups.creator_id, userId)
          )
        )
        .limit(1);

      if(!meetup) {
        console.log(`Meetup ${meetupId} not found or user ${userId} is not the creator`);
        return res.status(404).json({ error: "Meetup not found or you're not the creator" });
      }

      if (new Date(meetup.expiresAt) <= new Date()) {
        console.log(`Cannot extend expired meetup ${meetupId}`);
        return res.status(400).json({ error: "Cannot extend an expired meetup" });
      }

      // Extend by the specified number of hours
      const newExpiryTime = new Date(meetup.expiresAt);
      newExpiryTime.setHours(newExpiryTime.getHours() + hours);

      // Check if new expiry time exceeds 24 hours from creation
      const creationTime = new Date(meetup.createdAt || new Date());
      const maxExpiryTime = new Date(creationTime.getTime() + 24 * 60 * 60 * 1000);

      if (newExpiryTime > maxExpiryTime) {
        return res.status(400).json({
          error: "Cannot extend beyond 24 hours from creation time"
        });
      }

      // Update expiry time
      const [updatedMeetup] = await db
        .update(meetups)
        .set({ expiresAt: newExpiryTime })
        .where(eq(meetups.id, meetupId))
        .returning();

      // Notify all participants
      const participants = await db
        .select({
          user_id: meetupParticipants.user_id
        })
        .from(meetupParticipants)
        .where(eq(meetupParticipants.meetup_id, meetupId));

      // Create notifications for all participants using raw SQL to avoid column naming issues
      await Promise.all(participants.map(async (participant) => {
        await db.execute(sql`
          INSERT INTO notifications 
          (user_id, title, message, type, created_at)
          VALUES 
          (${participant.user_id}, 
           ${'Meetup Extended'}, 
           ${`The meetup "${meetup.title}" has been extended by ${hours} hour${hours > 1 ? 's' : ''}`}, 
           ${'info'},
           ${new Date()})
        `);
        void sendPushNotification(participant.user_id, {
          title: "Meetup Extended",
          message: `The meetup "${meetup.title}" has been extended by ${hours} hour${hours > 1 ? 's' : ''}`,
        });
      }));

      console.log(`Successfully extended meetup ${meetupId} by ${hours} hours`);
      res.json(updatedMeetup);
    } catch (error) {
      console.error('Failed to extend meetup:', error);
      res.status(500).json({ error: "Failed to extend meetup" });
    }
  });

  // End meetup early
  app.post("/api/meetups/:meetupId/complete", async (req, res) => {
    const reqId = Date.now();
    console.log(`[Complete Meetup ${reqId}] Request received for meetupId: ${req.params.meetupId}`);

    if (!isAuthenticated(req)) {
      console.log(`[Complete Meetup ${reqId}] Authentication failed for user session:`, req.session);
      return res.status(401).json({ error: "Not authenticated" });
    }

    const meetupId = parseInt(req.params.meetupId);
    const userId = req.session.userId;

    try {
      console.log(`[Complete Meetup ${reqId}] Looking up meetup ${meetupId} for user ${userId}`);

      // Get the meetup and verify ownership
      const [meetup] = await db
        .select()
        .from(meetups)
        .where(
          and(
            eq(meetups.id, meetupId),
            eq(meetups.creator_id, userId)
          )
        )
        .limit(1);

      if (!meetup) {
        console.log(`[Complete Meetup ${reqId}] Meetup ${meetupId} not found or user ${userId} is not the creator`);
        return res.status(404).json({ error: "Meetup not found or you're not the creator" });
      }

      if (new Date(meetup.expiresAt) <= new Date()) {
        console.log(`[Complete Meetup ${reqId}] Meetup ${meetupId} is already expired`);
        return res.status(400).json({ error: "Meetup is already expired" });
      }

      // Get all participants
      const participants = await db
        .select()
        .from(meetupParticipants)
        .where(eq(meetupParticipants.meetup_id, meetupId));

      console.log(`[Complete Meetup ${reqId}] Found ${participants.length} participants to update`);

      // Update meet history records for all participants
      console.log(`[Complete Meetup ${reqId}] 🛠️ Preparing to update meetHistory records for all participants...`);
      
      for (const participant of participants) {
        try {
          console.log(`🔍 Checking existing history for user ${participant.user_id} in meetup ${meetupId}`);
      
          // Check for existing record
          const [existingRecord] = await db
            .select()
            .from(meetHistory)
            .where(
              and(
                eq(meetHistory.user_id, participant.user_id),
                eq(meetHistory.meetup_id, meetupId)
              )
            )
            .limit(1);
      
          const now = new Date();
      
          if (existingRecord) {
            console.log(`✏️ Updating existing meetHistory record for user ${participant.user_id}`);
      
            // Update existing record
            await db
              .update(meetHistory)
              .set({ left_at: now })
              .where(
                and(
                  eq(meetHistory.user_id, participant.user_id),
                  eq(meetHistory.meetup_id, meetupId)
                )
              );
      
            console.log(`✅ Successfully updated meetHistory for user ${participant.user_id}`);
          } else {
            console.log(`🆕 Creating new meetHistory record for user ${participant.user_id}`);
      
            // Create new record
            await db
              .insert(meetHistory)
              .values({
                user_id: participant.user_id,
                meetup_id: meetupId,
                joined_at: now,
                left_at: now
              });
      
            console.log(`✅ Successfully inserted new meetHistory record for user ${participant.user_id}`);
    }
  } catch (err) {
    console.error(`❌ [Complete Meetup ${reqId}] Error updating history for participant ${participant.user_id}:`, err);
    // Continue processing other participants even if one fails
  }
}

console.log(`[Complete Meetup ${reqId}] ⏳ Updating meetup expiry time to now...`);

      // Update meetup expiry time to now
      const [updatedMeetup] = await db
        .update(meetups)
        .set({ expiresAt: new Date() })
        .where(eq(meetups.id, meetupId))
        .returning();

      // Create notifications for all participants
      await Promise.all(participants.map(async (participant) => {
        await db.insert(notifications).values({
          user_id: participant.user_id,
          title: "Meetup Ended",
          message: `The meetup "${meetup.title}" has been ended by the creator.`,
          type: 'info',
          link: '/rate/' + meetupId
        });
        void sendPushNotification(participant.user_id, {
          title: "Meetup Ended",
          message: `The meetup "${meetup.title}" has been ended by the creator.`,
          link: `/rate/${meetupId}`,
        });
      }));

      console.log(`[Complete Meetup ${reqId}] Successfully completed meetup ${meetupId}`);
      res.json({ message: "Meetup completed successfully", meetup: updatedMeetup });
    } catch (error) {
      console.error(`[Complete Meetup ${reqId}] Failed to complete meetup:`, error);
      res.status(500).json({ error: "Failed to complete meetup" });
    }
  });

  // Remove participant from meetup
  app.delete("/api/meetups/:meetupId/members/:userId/remove", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const meetupId = parseInt(req.params.meetupId);
    const participantId = parseInt(req.params.userId);
    const creatorId = req.session.userId;

    console.log(`Attempting to remove participant ${participantId} from meetup ${meetupId} by creator ${creatorId}`);

    try {
      // Verify the meetup exists and the requester is the creator
      const [meetup] = await db
        .select()
        .from(meetups)
        .where(
          and(
            eq(meetups.id, meetupId),
            eq(meetups.creator_id, creatorId)
          )
        )
        .limit(1);

      if (!meetup) {
        console.log(`Meetup ${meetupId} not found or user ${creatorId} is not the creator`);
        return res.status(404).json({ error: "Meetup not found or you're not the creator" });
      }

      if (new Date(meetup.expiresAt) <= new Date()) {
        console.log(`Cannot modify expired meetup ${meetupId}`);
        return res.status(400).json({ error: "Cannot modify an expired meetup" });
      }

      // Remove the participant
      await db
        .delete(meetupParticipants)
        .where(
          and(
            eq(meetupParticipants.meetup_id, meetupId),
            eq(meetupParticipants.user_id, participantId)
          )
        );

      // Create notification for the removed participant
      await db
        .insert(notifications)
        .values({
          user_id: participantId,
          title: "Removed from Meetup",
          message: `You have been removed from the meetup "${meetup.title}"`,
          type: 'warning'
        });
      void sendPushNotification(participantId, {
        title: "Removed from Meetup",
        message: `You have been removed from the meetup "${meetup.title}"`,
      });

      console.log(`Successfully removed participant ${participantId} from meetup ${meetupId}`);
      res.json({ message: "Participant removed successfully" });
    } catch (error) {
      console.error('Failed to remove participant:', error);
      res.status(500).json({ error: "Failed to remove participant" });
    }
  });

  // Leave meetup (for participants)
  app.post("/api/meetups/:meetupId/leave", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const meetupId = parseInt(req.params.meetupId);
    const userId = req.session.userId;

    console.log(`User ${userId} attempting to leave meetup ${meetupId}`);

    try {
      // Get the meetup
      const [meetup] = await db
        .select()
        .from(meetups)
        .where(eq(meetups.id, meetupId))
        .limit(1);

      if (!meetup) {
        console.log(`Meetup ${meetupId} not found`);
        return res.status(404).json({ error: "Meetup not found" });
      }

      if (new Date(meetup.expiresAt) <= new Date()) {
        console.log(`Cannot leave expired meetup ${meetupId}`);
        return res.status(400).json({ error: "Cannot leave an expired meetup" });
      }

      // A group meetup is owned by the group's membership lifecycle. Letting
      // a member leave through the individual endpoint leaves the group
      // pointer locked to a meetup the member no longer belongs to and makes
      // the user appear to have a phantom active meetup. Use the group
      // leave/disband flow instead so membership and participation are
      // detached atomically.
      const [groupMembership] = await db
        .select({
          groupId: groupMembers.group_id,
          role: groupMembers.role,
          currentMeetupId: groups.current_meetup_id,
        })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.group_id, groups.id))
        .where(
          and(
            eq(groupMembers.user_id, userId),
            eq(groups.current_meetup_id, meetupId),
          ),
        )
        .limit(1);
      if (groupMembership) {
        const leaderMessage =
          "The group creator cannot leave a group meetup individually. Disband the group from My Group instead.";
        const memberMessage =
          "You cannot leave a group meetup individually. Leave the group from My Group to detach your participation.";
        return res.status(409).json({
          error:
            groupMembership.role === "leader"
              ? leaderMessage
              : memberMessage,
          code: "group_meetup_leave_requires_group_action",
          groupId: groupMembership.groupId,
          link: "/groups",
        });
      }

      // Verify user is a participant and not the creator
      if (meetup.creator_id === userId) {
        console.log(`Creator ${userId} attempted to leave their own meetup ${meetupId}`);
        return res.status(400).json({ error: "Creator cannot leave their own meetup" });
      }

      const [participation] = await db
        .select()
        .from(meetupParticipants)
        .where(
          and(
            eq(meetupParticipants.meetup_id, meetupId),
            eq(meetupParticipants.user_id, userId)
          )
        )
        .limit(1);

      if (!participation) {
        console.log(`User ${userId} is not a participant in meetup ${meetupId}`);
        return res.status(400).json({ error: "You are not a participant in this meetup" });
      }

      // Remove the participant
      await db
        .delete(meetupParticipants)
        .where(
          and(
            eq(meetupParticipants.meetup_id, meetupId),
            eq(meetupParticipants.user_id, userId)
          )
        );

// Check if an existing meet history record exists where the user hasn't left yet
const [existingHistory] = await db
  .select()
  .from(meetHistory)
  .where(
    and(
      eq(meetHistory.user_id, userId),
      eq(meetHistory.meetup_id, meetupId),
      sql`${meetHistory.left_at} IS NULL` // Ensures we're only checking records where left_at is still NULL
    )
  )
  .limit(1);

if (existingHistory) {
  console.log(`✏️ Updating existing meetHistory record for user ${userId} in meetup ${meetupId}`);

  // Update the `leftAt` timestamp for the existing record
  await db
    .update(meetHistory)
    .set({ left_at: new Date() })
    .where(eq(meetHistory.id, existingHistory.id));

  console.log(`✅ Successfully updated meetHistory record for user ${userId}`);
} else {
  console.log(`ℹ️ No active meetHistory record found for user ${userId} in meetup ${meetupId}, skipping update.`);
}


      console.log(`User ${userId} successfully left meetup ${meetupId}`);
      res.json({ message: "Successfully left the meetup" });
    } catch (error) {
      console.error('Failed to leave meetup:', error);
      res.status(500).json({ error: "Failed to leave meetup" });
    }
  });
  // Add notification endpoints
  app.get("/api/notifications", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.session.userId;
      console.log(`Fetching notifications for user ${userId}`);

      const userNotifications = await db
        .select({
          id: notifications.id,
          title: notifications.title,
          message: notifications.message,
          type: notifications.type,
          link: notifications.link,
          isRead: notifications.isRead,
          isSeen: notifications.isSeen,
          createdAt: notifications.createdAt
        })
        .from(notifications)
        .where(eq(notifications.user_id, userId))
        .orderBy(desc(notifications.createdAt));

      console.log(`Found ${userNotifications.length} notifications`);
      res.json(userNotifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const notificationId = parseInt(req.params.id);
      const userId = req.session.userId;
      console.log(`Marking notification ${notificationId} as read for user ${userId}`);

      // Verify notification belongs to user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.user_id, userId)
          )
        )
        .limit(1);

      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      // Import the notification service
      const { markNotificationAsRead } = await import('./services/notifications');
      
      // Mark notification as read using the service
      const success = await markNotificationAsRead(notificationId);
      
      if (!success) {
        return res.status(500).json({ error: "Failed to mark notification as read" });
      }

      console.log(`Successfully marked notification ${notificationId} as read`);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/:id/seen", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const notificationId = parseInt(req.params.id);
      const userId = req.session.userId;
      console.log(`Marking notification ${notificationId} as seen for user ${userId}`);

      // Verify notification belongs to user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.user_id, userId)
          )
        )
        .limit(1);

      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      // Update notification
      await db
        .update(notifications)
        .set({ isSeen: true })
        .where(eq(notifications.id, notificationId));

      console.log(`Successfully marked notification ${notificationId} as seen`);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to mark notification as seen:', error);
      res.status(500).json({ error: "Failed to mark notification as seen" });
    }
  });
  // Mark all notifications as read
  app.post("/api/notifications/mark-all-read", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = req.session.userId;
    console.log(`Marking all notifications as read for user ${userId}`);

    try {
      // Update all unread notifications for this user
      const result = await db
        .update(notifications)
        .set({
          isRead: true,
          isSeen: true
        })
        .where(
          and(
            eq(notifications.user_id, userId),
            or(
              eq(notifications.isRead, false),
              eq(notifications.isSeen, false)
            )
          )
        )
        .returning();

      console.log(`Successfully marked ${result.length} notifications as read for user ${userId}`);
      res.json({ message: "All notifications marked as read", count: result.length });
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // Update user profile
  app.put("/api/users/:userId/profile", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Only allow users to update their own profile
    const userId =
      req.params.userId === "me"
        ? req.session.userId
        : parseInt(req.params.userId);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    if (userId !== req.session.userId) {
      return res.status(403).json({ error: "Cannot update another user's profile" });
    }

    const { displayName, bio, gender, birthday, profilePicture } = req.body;
    console.log(`Updating profile for user ${userId}:`, { displayName, bio, gender, birthday, profilePicture: profilePicture ? '(exists)' : null });

    try {
      // Update user profile
      const profileUpdate: Record<string, unknown> = {};
      if (displayName !== undefined) profileUpdate.displayName = displayName;
      if (bio !== undefined) profileUpdate.bio = bio;
      if (gender !== undefined) profileUpdate.gender = gender;
      if (birthday !== undefined) profileUpdate.birthday = birthday ? new Date(birthday) : null;
      if (profilePicture !== undefined) profileUpdate.profilePicture = profilePicture;

      const [updatedUser] = await db
        .update(users)
        .set(profileUpdate)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) return res.status(404).json({ error: "User not found" });
      const { password: _password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      console.error('Failed to update user profile:', error);
      res.status(500).json({ error: "Failed to update user profile" });
    }
  });

  // Get user profile
  app.get("/api/users/:userId/profile", async (req, res) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId =
        req.params.userId === "me"
          ? req.session.userId
          : parseInt(req.params.userId);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      console.log(`Fetching profile for user ${userId}`);

      // Keep contact information and full birthdays limited to the profile
      // owner. Other authenticated users receive only public profile data.
      const isOwnProfile = req.session.userId === userId;
      const publicUserFields = {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        bio: users.bio,
        gender: users.gender,
        createdAt: users.createdAt,
        profilePicture: users.profilePicture,
      };
      const [user] = await db
        .select(
          isOwnProfile
            ? {
                ...publicUserFields,
                email: users.email,
                birthday: users.birthday,
              }
            : publicUserFields,
        )
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (!user) {
        console.log(`User ${userId} not found`);
        return res.status(404).json({ error: "User not found" });
      }

      // We'll get user traits directly using a SQL query to avoid middleware issues
      const userTraitsResult = await db.execute(sql`
        WITH trait_endorsements AS (
          SELECT 
            ut."trait_id",
            SUM(CASE WHEN ut."endorsement_count" > 0 THEN ut."endorsement_count" ELSE 0 END) AS positive_count,
            COUNT(ut."id") AS total_votes
          FROM "user_traits" ut
          WHERE ut."user_id" = ${userId}
          GROUP BY ut."trait_id"
          HAVING SUM(ut."endorsement_count") > 0
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
        JOIN trait_endorsements te ON t."id" = te."trait_id"
        LEFT JOIN trait_endorsers ter ON t."id" = ter."trait_id"
        GROUP BY t."id", t."name", t."category", te."positive_count", te."total_votes", ter."endorsers"
        ORDER BY "endorsements" DESC, "traitName" ASC
      `);
      
      // Transform the results to match the expected format
      const transformedTraits = {
        traits: userTraitsResult.rows.map((trait: any) => {
          return {
            traitId: trait.traitId,
            traitName: trait.traitName,
            traitCategory: trait.traitCategory,
            endorsements: parseInt(trait.endorsements) || 0,
            totalVotes: parseInt(trait.totalVotes) || 0,
            endorsers: Array.isArray(trait.endorsers) ? trait.endorsers : []
          };
        })
      };
      
      // Get meet history with a separate raw SQL query to avoid column ambiguity
      const meetHistoryResult = await db.execute(sql`
        SELECT json_agg(
          json_build_object(
            'id', mh.id,
            'meetup', json_build_object(
              'title', m.title,
              'theme', m.theme,
               'creator', CASE WHEN m.group_id IS NOT NULL THEN g.name ELSE u.username END,
               'creatorGroupName', g.name
            ),
            'joinedAt', mh.joined_at,
            'leftAt', mh.left_at, 
            'createdAt', mh.created_at,
            'userId', mh.user_id,
            'meetupId', mh.meetup_id
          )
          ORDER BY mh.joined_at DESC
        ) AS meet_history
        FROM meet_history mh
        JOIN meetups m ON m.id = mh.meetup_id 
        LEFT JOIN users u ON m.creator_id = u.id
         LEFT JOIN groups g ON m.group_id = g.id
        WHERE mh.user_id = ${userId}
      `);

      // Get count of hosted meetups
      const hostedMeetupsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(meetups)
        .where(eq(meetups.creator_id, userId));
      
      // Get count of friends
      const friendsResult = await db.execute(sql`
        SELECT COUNT(*) as friend_count 
        FROM friends 
        WHERE user_id = ${userId} OR friend_id = ${userId}
      `);

      // Calculate metrics
      const meetupCount = meetHistoryResult.rows[0]?.meet_history?.length || 0;
      const traitCount = transformedTraits.traits.length;
      const hostCount = parseInt(hostedMeetupsResult[0]?.count.toString() || '0');
      const totalMeetups = meetupCount;
      
      // Determine tier based on metrics
      let tier = 'bronze';
      if (totalMeetups >= 50 || hostCount >= 20 || traitCount >= 15) {
        tier = 'diamond';
      } else if (totalMeetups >= 30 || hostCount >= 10 || traitCount >= 10) {
        tier = 'platinum';
      } else if (totalMeetups >= 20 || hostCount >= 5 || traitCount >= 7) {
        tier = 'gold';
      } else if (totalMeetups >= 10 || hostCount >= 3 || traitCount >= 5) {
        tier = 'silver';
      }

      // Create achievements
      const achievements = [
        {
          id: 1,
          name: "Social Butterfly",
          description: `Attended ${meetupCount} meetups`,
          tier: meetupCount >= 30 ? 'platinum' : meetupCount >= 20 ? 'gold' : meetupCount >= 10 ? 'silver' : 'bronze',
          earnedAt: user.createdAt
        },
        {
          id: 2,
          name: "Host Extraordinaire",
          description: `Hosted ${hostCount} events`,
          tier: hostCount >= 20 ? 'platinum' : hostCount >= 10 ? 'gold' : hostCount >= 5 ? 'silver' : 'bronze',
          earnedAt: user.createdAt
        },
        {
          id: 3,
          name: "Personality Profile",
          description: `Has ${traitCount} distinct traits`,
          tier: traitCount >= 15 ? 'platinum' : traitCount >= 10 ? 'gold' : traitCount >= 5 ? 'silver' : 'bronze',
          earnedAt: user.createdAt
        }
      ];
      
      // Create combined profile response
      const profile = {
        ...user,
        meetHistory: meetHistoryResult.rows[0]?.meet_history || [],
        traits: transformedTraits.traits || [],
        tier,
        achievements,
        stats: {
          totalHosts: hostCount,
          totalMeetups: totalMeetups,
          traits: traitCount,
          friends: parseInt(friendsResult.rows[0]?.friend_count?.toString() || '0')
        }
      };

      console.log(`Successfully fetched profile for user ${userId}`);
      res.json(profile);
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  // Get meet history for a user
app.get("/api/users/:userId/meet-history", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userId = parseInt(req.params.userId);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    if (userId !== req.session.userId) {
      return res.status(403).json({ error: "Cannot view another user's private meet history" });
    }

    // Get raw meet history count first
    const historyCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(meetHistory)
      .where(eq(meetHistory.user_id, userId));

    // Use raw SQL query with snake_case column names used in the DB
    const meetHistoryEntries = await db.execute(sql`
      SELECT 
        mh.id, 
        mh.user_id as "userId", 
        mh.meetup_id as "meetupId", 
        mh.joined_at as "joinedAt", 
        mh.left_at as "leftAt", 
        mh.created_at as "createdAt",
        json_build_object(
          'title', m.title,
          'theme', m.theme,
           'creator', CASE WHEN m.group_id IS NOT NULL THEN g.name ELSE u.username END,
           'creatorGroupName', g.name
        ) as meetup
      FROM meet_history mh
      INNER JOIN meetups m ON mh.meetup_id = m.id
      INNER JOIN users u ON m.creator_id = u.id
       LEFT JOIN groups g ON m.group_id = g.id
      WHERE mh.user_id = ${userId}
      ORDER BY mh.joined_at DESC
    `);
    
    // Extract the rows from the raw query result
    const meetHistoryRows = meetHistoryEntries.rows;

    return res.status(200).json(meetHistoryRows);
  } catch (error) {
    console.error("Failed to fetch meet history:", error instanceof Error ? error.message : "unknown error");
    return res.status(500).json({ error: "Failed to fetch meet history" });
  }
});

// Get user stats (friend count, meets attended, trait count)
app.get("/api/users/:userId/stats", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    if (userId !== req.session.userId) {
      return res.status(403).json({ error: "Cannot view another user's private stats" });
    }

    // Get stats using the getUserStats service
    const stats = await getUserStats(userId);
    res.json(stats);
  } catch (error) {
    console.error("Failed to fetch user stats:", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
});

// Profile picture upload endpoint
app.post("/api/users/profile-picture", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.session.userId;
  const { profilePicture } = req.body;

  if (
    typeof profilePicture !== "string" ||
    !/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(profilePicture) ||
    profilePicture.length > 7 * 1024 * 1024
  ) {
    return res.status(400).json({ error: "Profile picture data is required" });
  }

  const encodedImage = profilePicture.slice(profilePicture.indexOf(",") + 1);
  const imageBytes = Math.floor((encodedImage.length * 3) / 4) - (encodedImage.endsWith("==") ? 2 : encodedImage.endsWith("=") ? 1 : 0);
  if (imageBytes > 5 * 1024 * 1024) {
    return res.status(413).json({ error: "Profile picture must be 5 MB or smaller" });
  }

  try {
    console.log(`Uploading profile picture for user ${userId}`);
    
    // Update user profile with the new profile picture
    const [updatedUser] = await db
      .update(users)
      .set({ profilePicture })
      .where(eq(users.id, userId))
      .returning();

    console.log(`Successfully updated profile picture for user ${userId}`);
    res.json({ success: true, profilePicture: updatedUser.profilePicture });
  } catch (error) {
    console.error('Failed to upload profile picture:', error);
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
});

// Delete profile picture endpoint
app.delete("/api/users/profile-picture", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = req.session.userId;

  try {
    console.log(`Removing profile picture for user ${userId}`);
    
    // Update user profile to remove the profile picture
    const [updatedUser] = await db
      .update(users)
      .set({ profilePicture: null })
      .where(eq(users.id, userId))
      .returning();

    console.log(`Successfully removed profile picture for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove profile picture:', error);
    res.status(500).json({ error: "Failed to remove profile picture" });
  }
});

// Alternate endpoint for fetching user meet history was removed (redundant)
}
