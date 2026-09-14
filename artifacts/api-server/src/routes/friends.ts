import { Router } from "express";
import { createNotification } from "../services/notifications";
import { db } from "@workspace/db";
import { and, eq, or, sql, not, desc, ne } from "drizzle-orm";
import { friends, friendRequests, users, notifications, meetups, meetupParticipants, userTraits, traits, meetHistory } from "@workspace/db";
import { z } from "zod/v4";
import { getUserStats } from "../services/stats";

const router = Router();

function isAuthenticated(req: any) {
  return !!req.session?.userId;
}

// Send friend request
router.post("/api/friends/requests", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const schema = z.object({
    recipientId: z.number()
  });

  try {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    const { recipientId } = result.data;

    // Check if trying to friend self
    if (recipientId === req.session.userId) {
      return res.status(400).json({ error: "Cannot send friend request to yourself" });
    }

    // Check if recipient exists
    const [recipient] = await db
      .select()
      .from(users)
      .where(eq(users.id, recipientId))
      .limit(1);

    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    // Check for existing friend request
    const [existingRequest] = await db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.sender_id, req.session.userId),
          eq(friendRequests.recipient_id, recipientId),
          sql`${friendRequests.status} != 'rejected'`
        )
      )
      .limit(1);

    if (existingRequest) {
      return res.status(400).json({
        error: "A friend request already exists"
      });
    }

    // Check if already friends
    const [existingFriendship] = await db
      .select()
      .from(friends)
      .where(
        or(
          and(
            eq(friends.user_id, req.session.userId),
            eq(friends.friend_id, recipientId)
          ),
          and(
            eq(friends.user_id, recipientId),
            eq(friends.friend_id, req.session.userId)
          )
        )
      )
      .limit(1);

    if (existingFriendship) {
      return res.status(400).json({
        error: "You are already friends with this user"
      });
    }

    // Get sender's username for notification
    const [sender] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!sender) {
      return res.status(404).json({ error: "Sender not found" });
    }

    // Create friend request
    const [newRequest] = await db
      .insert(friendRequests)
      .values({
        sender_id: req.session.userId,
        recipient_id: recipientId,
        status: 'pending',
        created_at: new Date()
      })
      .returning();

    if (!newRequest) {
      throw new Error("Failed to create friend request");
    }

    // Create notification
    await createNotification(
      recipientId,
      "New Friend Request",
      `${sender.username} sent you a friend request`,
      "friend_request",
      undefined,
      "/friends",
    );

    return res.json(newRequest);
  } catch (error) {
    console.error("Friend request error:", error);
    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof Error ? error.message : "Failed to send friend request"
    });
  }
});

// Get user profile with meet history
router.get("/api/users/:userId/profile", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    let targetUserId = req.params.userId;

    // Handle the "me" case
    if (targetUserId === "me") {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      targetUserId = req.session.userId;
    }

    // Convert to number for numeric IDs
    const userId = parseInt(targetUserId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Get basic user info
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get meet history
    const meetHistory = await db
      .select({
        id: meetupParticipants.id,
        joinedAt: meetupParticipants.createdAt,
        meetup: {
          title: meetups.title,
          theme: meetups.theme
        }
      })
      .from(meetupParticipants)
      .innerJoin(meetups, eq(meetupParticipants.meetup_id, meetups.id))
      .where(eq(meetupParticipants.user_id, userId))
      .orderBy(desc(meetupParticipants.createdAt));

    // Get user traits with endorsement counts
    const userTraitsWithCounts = await db
      .select({
        traitId: userTraits.trait_id,
        traitName: traits.name,
        traitCategory: traits.category,
        endorsements: sql<number>`count(*)`,
        endorsers: sql<string[]>`array_agg(distinct ${users.username})`
      })
      .from(userTraits)
      .innerJoin(traits, eq(traits.id, userTraits.trait_id))
      .innerJoin(users, eq(users.id, userTraits.endorser_id))
      .where(eq(userTraits.user_id, userId))
      .groupBy(userTraits.trait_id, traits.id, traits.name, traits.category)
      .orderBy(desc(sql`count(*)`));

    // Return combined user info with meet history and traits
    res.json({
      ...user,
      meetHistory,
      traits: userTraitsWithCounts
    });
  } catch (error) {
    console.error("Failed to get user profile:", error);
    res.status(500).json({ error: "Failed to get user profile" });
  }
});

// Search users
router.get("/api/users/search", async (req, res) => {
  console.log(`User search request received: ${JSON.stringify(req.query)}`);
  
  // Allow non-authenticated users to search in public contexts (like leaderboards)
  // If a specific context is provided, check if it's allowed for public access
  const searchContext = req.query.context as string; 
  const isPublicContext = searchContext === 'leaderboard';
  
  if (!isAuthenticated(req) && !isPublicContext) {
    console.log("Search request rejected: Not authenticated and not in public context");
    return res.status(401).json({ error: "Not authenticated" });
  }

  const query = req.query.q as string;
  if (!query?.trim()) {
    console.log("Empty search query, returning empty results");
    return res.json({ users: [], hasMore: false, total: 0 });
  }

  // Parse pagination parameters with defaults
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = (page - 1) * limit;
  
  console.log(`Processing search with parameters: query="${query}", page=${page}, limit=${limit}, offset=${offset}`);

  try {
    // First, get the total count for pagination info
    let countQuery;
    
    // For authenticated users, exclude themselves from the results
    if (isAuthenticated(req)) {
      countQuery = and(
        or(
          sql`LOWER(${users.username}) LIKE ${`%${query.toLowerCase()}%`}`,
          sql`LOWER(${users.displayName}) LIKE ${`%${query.toLowerCase()}%`}`
        ),
        sql`${users.id} != ${req.session.userId}`
      );
    } else {
      // For non-authenticated users, just search by name without excluding
      countQuery = or(
        sql`LOWER(${users.username}) LIKE ${`%${query.toLowerCase()}%`}`,
        sql`LOWER(${users.displayName}) LIKE ${`%${query.toLowerCase()}%`}`
      );
    }
    
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(countQuery);
    
    // Safely extract count with fallback
    const total = countResult && countResult[0] && typeof countResult[0].count === 'number' 
      ? countResult[0].count 
      : 0;
    
    console.log(`Found total of ${total} matching users`);
    
    // Then get the actual results for this page
    let searchQuery;
    
    // For authenticated users, exclude themselves from the results
    if (isAuthenticated(req)) {
      searchQuery = and(
        or(
          sql`LOWER(${users.username}) LIKE ${`%${query.toLowerCase()}%`}`,
          sql`LOWER(${users.displayName}) LIKE ${`%${query.toLowerCase()}%`}`
        ),
        sql`${users.id} != ${req.session.userId}`
      );
    } else {
      // For non-authenticated users, just search by name without excluding
      searchQuery = or(
        sql`LOWER(${users.username}) LIKE ${`%${query.toLowerCase()}%`}`,
        sql`LOWER(${users.displayName}) LIKE ${`%${query.toLowerCase()}%`}`
      );
    }
    
    const searchResults = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
        displayName: users.displayName
      })
      .from(users)
      .where(searchQuery)
      .orderBy(users.username)
      .limit(limit)
      .offset(offset);

    // Ensure searchResults is an array
    const safeResults = Array.isArray(searchResults) ? searchResults : [];
    const hasMore = offset + safeResults.length < total;
    
    console.log(`Returning ${safeResults.length} results, hasMore=${hasMore}`);

    // Return paginated results with metadata
    return res.json({
      users: safeResults,
      total,
      page,
      limit,
      hasMore
    });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({
      error: "Failed to search users",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Cleanup endpoint for handling requests by recipient ID
// This is a utility endpoint for the UI to use when the request ID is unknown
router.post("/api/friends/cleanup-pending-requests", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    // Get recipient ID from query param
    const recipientId = parseInt(req.query.recipientId as string);
    if (isNaN(recipientId)) {
      return res.status(400).json({ error: "Invalid recipient ID" });
    }

    console.log(`Cleanup: Attempting to delete pending requests from user ${req.session.userId} to recipient ${recipientId}`);

    // Find any pending requests from this user to the recipient
    const requests = await db
      .select({
        id: friendRequests.id
      })
      .from(friendRequests)
      .where(
        and(
          sql`${friendRequests.sender_id} = ${req.session.userId}`,
          sql`${friendRequests.recipient_id} = ${recipientId}`,
          sql`${friendRequests.status} = 'pending'`
        )
      );

    if (requests.length === 0) {
      console.log(`Cleanup: No pending requests found from user ${req.session.userId} to recipient ${recipientId}`);
      return res.json({ 
        success: true, 
        message: "No pending requests found to clean up",
        count: 0
      });
    }

    console.log(`Cleanup: Found ${requests.length} pending requests to clean up:`, requests);

    // Delete all pending requests from this user to the recipient
    const result = await db
      .delete(friendRequests)
      .where(
        and(
          sql`${friendRequests.sender_id} = ${req.session.userId}`,
          sql`${friendRequests.recipient_id} = ${recipientId}`,
          sql`${friendRequests.status} = 'pending'`
        )
      )
      .returning();

    console.log(`Cleanup: Deleted ${result.length} pending requests:`, result);

    return res.json({ 
      success: true, 
      message: `Successfully cleaned up ${result.length} pending friend requests`,
      count: result.length
    });
  } catch (error) {
    console.error("Failed to clean up friend requests:", error);
    return res.status(500).json({ error: "Failed to clean up friend requests" });
  }
});

// Get authenticated user's friends
router.get("/api/friends", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    // Query friends from both directions (as user_id or friend_id)
    const userFriends = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        created_at: users.createdAt
      })
      .from(users)
      .innerJoin(
        friends,
        or(
          and(
            eq(friends.friend_id, users.id),
            eq(friends.user_id, req.session.userId)
          ),
          and(
            eq(friends.user_id, users.id),
            eq(friends.friend_id, req.session.userId)
          )
        )
      );

    return res.json(userFriends);
  } catch (error) {
    console.error("Failed to get friends:", error);
    return res.status(500).json({ error: "Failed to get friends" });
  }
});

// Get friend requests
router.get("/api/friends/requests", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const requests = await db
      .select({
        id: friendRequests.id,
        status: friendRequests.status,
        created_at: friendRequests.created_at,
        sender_id: friendRequests.sender_id
      })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.recipient_id, req.session.userId),
          eq(friendRequests.status, 'pending')
        )
      );

    // Get sender details for each request
    const requestsWithSenders = await Promise.all(
      requests.map(async (request) => {
        const [sender] = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profilePicture: users.profilePicture,
            created_at: users.createdAt
          })
          .from(users)
          .where(eq(users.id, request.sender_id))
          .limit(1);

        return {
          id: request.id,
          status: request.status,
          created_at: request.created_at,
          sender: sender || null
        };
      })
    );

    return res.json(requestsWithSenders);
  } catch (error) {
    console.error("Failed to get friend requests:", error);
    return res.status(500).json({ error: "Failed to get friend requests" });
  }
});

// Get outgoing friend requests
router.get("/api/friends/outgoing-requests", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const requests = await db
      .select({
        id: friendRequests.id,
        status: friendRequests.status,
        created_at: friendRequests.created_at,
        recipient_id: friendRequests.recipient_id
      })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.sender_id, req.session.userId),
          eq(friendRequests.status, 'pending')
        )
      );

    // Get recipient details for each request
    const requestsWithRecipients = await Promise.all(
      requests.map(async (request) => {
        const [recipient] = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profilePicture: users.profilePicture,
            created_at: users.createdAt
          })
          .from(users)
          .where(eq(users.id, request.recipient_id))
          .limit(1);

        return {
          id: request.id,
          status: request.status,
          created_at: request.created_at,
          recipient: recipient || null
        };
      })
    );

    return res.json(requestsWithRecipients);
  } catch (error) {
    console.error("Failed to get outgoing friend requests:", error);
    return res.status(500).json({ error: "Failed to get outgoing friend requests" });
  }
});


// Handle friend request (accept/reject)
router.post("/api/friends/requests/:id", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const schema = z.object({
    status: z.enum(['accepted', 'rejected'])
  });

  try {
    const { status } = schema.parse(req.body);
    const requestId = parseInt(req.params.id);

    // Find the request and include sender's username
    const [request] = await db
      .select({
        id: friendRequests.id,
        sender_id: friendRequests.sender_id,
        recipient_id: friendRequests.recipient_id,
        senderUsername: users.username
      })
      .from(friendRequests)
      .innerJoin(users, eq(users.id, friendRequests.sender_id))
      .where(
        and(
          eq(friendRequests.id, requestId),
          eq(friendRequests.recipient_id, req.session.userId),
          eq(friendRequests.status, 'pending')
        )
      );

    if (!request) {
      return res.status(404).json({ error: "Friend request not found" });
    }

    // Get responder's username for the notification
    const [responder] = await db
      .select({
        username: users.username
      })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    // Update request status
    const [updatedRequest] = await db
      .update(friendRequests)
      .set({
        status,
        updated_at: new Date()
      })
      .where(eq(friendRequests.id, requestId))
      .returning();

    // Create notification for sender based on status
    await createNotification(
      request.sender_id,
      status === "accepted" ? "Friend Request Accepted" : "Friend Request Rejected",
      status === "accepted"
        ? `${responder.username} accepted your friend request`
        : `${responder.username} rejected your friend request`,
      status === "accepted" ? "friend_accepted" : "friend_rejected",
      undefined,
      "/friends",
    );

    // If accepted, create friendship
    if (status === 'accepted') {
      await db
        .insert(friends)
        .values({
          user_id: req.session.userId,
          friend_id: request.sender_id,
          created_at: new Date()
        });
    }

    return res.json(updatedRequest);
  } catch (error) {
    console.error("Failed to handle friend request:", error);
    return res.status(500).json({ error: "Failed to handle friend request" });
  }
});

// Handle request cancellation
router.post("/api/friends/requests/:id/cancel", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const requestId = parseInt(req.params.id);
    console.log(`Attempting to cancel friend request ID: ${requestId} by user ID: ${req.session.userId}`);

    // First check if the request exists and belongs to the user
    const [request] = await db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.id, requestId),
          eq(friendRequests.sender_id, req.session.userId)
        )
      );

    if (!request) {
      console.log(`No request found with ID: ${requestId} for user: ${req.session.userId}`);
      return res.status(404).json({ error: "Friend request not found" });
    }

    console.log(`Found request to cancel:`, request);
    
    if (request.status !== 'pending') {
      console.log(`Request ID: ${requestId} has status: ${request.status}, cannot cancel non-pending requests`);
      return res.status(400).json({ 
        error: "Cannot cancel a request that is not pending", 
        status: request.status 
      });
    }

    // Delete the request
    console.log(`Deleting friend request ID: ${requestId}`);
    const deleted = await db
      .delete(friendRequests)
      .where(
        and(
          eq(friendRequests.id, requestId),
          eq(friendRequests.sender_id, req.session.userId),
          eq(friendRequests.status, 'pending')
        )
      )
      .returning();
    
    console.log(`Delete operation result:`, deleted);

    return res.json({ 
      success: true, 
      message: "Friend request cancelled successfully",
      requestId: requestId
    });
  } catch (error) {
    console.error("Failed to cancel friend request:", error);
    return res.status(500).json({ error: "Failed to cancel friend request" });
  }
});

// Remove friend
router.delete("/api/friends/:id", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const friendId = parseInt(req.params.id);

    await db
      .delete(friends)
      .where(
        or(
          and(
            eq(friends.user_id, req.session.userId),
            eq(friends.friend_id, friendId)
          ),
          and(
            eq(friends.user_id, friendId),
            eq(friends.friend_id, req.session.userId)
          )
        )
      );

    return res.sendStatus(200);
  } catch (error) {
    console.error("Failed to remove friend:", error);
    return res.status(500).json({ error: "Failed to remove friend" });
  }
});

// Update stats endpoint to use the new service
router.get("/api/users/:userId/stats", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const stats = await getUserStats(userId);
    return res.json(stats);
  } catch (error) {
    console.error("Failed to get user stats:", error);
    return res.status(500).json({ 
      error: "Failed to get user stats",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Get recent meetup participants (people the user has met with)
router.get("/api/friends/recent", async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userId = req.session.userId;
    console.log(`Finding recent participants for user ID: ${userId}`);

    // First, get all the meetups the user has participated in - both current and historical
    const activeUserMeetups = await db
      .select({
        meetupId: meetupParticipants.meetup_id,
        joinedAt: meetupParticipants.created_at,
      })
      .from(meetupParticipants)
      .where(eq(meetupParticipants.user_id, userId))
      .orderBy(desc(meetupParticipants.created_at));
      
    console.log(`Found ${activeUserMeetups.length} active meetups for user ${userId}`);
    
    // Also get meetups from meet history for completed meets
    const historicalUserMeetups = await db
      .select({
        meetupId: meetHistory.meetup_id,
        joinedAt: meetHistory.joined_at,
      })
      .from(meetHistory)
      .where(eq(meetHistory.user_id, userId))
      .orderBy(desc(meetHistory.joined_at));
      
    console.log(`Found ${historicalUserMeetups.length} historical meetups for user ${userId}`);
      
    // Combine both sources
    const userMeetups = [...activeUserMeetups, ...historicalUserMeetups];
    console.log(`Combined ${userMeetups.length} total meetups`);

    if (userMeetups.length === 0) {
      return res.json([]);
    }

    // Get all meetup IDs the user has participated in
    const meetupIds = [...new Set(userMeetups.map(meetup => meetup.meetupId))];
    console.log(`Distinct meetup IDs: ${meetupIds.length} meetups`);
    
    if (meetupIds.length === 0) {
      console.log("No meetup IDs found, returning empty array");
      return res.json([]);
    }

    // Properly handling the IN clause for SQL
    // We need to create placeholders and provide separate parameters for each ID
    
    // Get participants from active meetups
    const activeParticipants = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        lastMeetupAt: meetupParticipants.created_at
      })
      .from(meetupParticipants)
      .innerJoin(users, eq(meetupParticipants.user_id, users.id))
      .where(
        and(
          ne(meetupParticipants.user_id, userId),
          meetupIds.length > 0 ? sql`${meetupParticipants.meetup_id} IN (${sql.join(meetupIds.map(id => sql`${id}`), sql`, `)})` : sql`FALSE`
        )
      );
      
    // Also get participants from meet history
    const historyParticipants = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        lastMeetupAt: meetHistory.joined_at
      })
      .from(meetHistory)
      .innerJoin(users, eq(meetHistory.user_id, users.id))
      .where(
        and(
          ne(meetHistory.user_id, userId),
          meetupIds.length > 0 ? sql`${meetHistory.meetup_id} IN (${sql.join(meetupIds.map(id => sql`${id}`), sql`, `)})` : sql`FALSE`
        )
      );
      
    // Combine both sources and get unique participants
    const allParticipants = [...activeParticipants, ...historyParticipants];
    console.log(`Found ${activeParticipants.length} active participants and ${historyParticipants.length} historical participants, for a total of ${allParticipants.length} total participants`);
    
    // Group by user ID to get unique participants with their most recent interaction
    const participantMap = new Map();
    allParticipants.forEach(participant => {
      const existingParticipant = participantMap.get(participant.id);
      if (!existingParticipant || new Date(participant.lastMeetupAt) > new Date(existingParticipant.lastMeetupAt)) {
        participantMap.set(participant.id, participant);
      }
    });
    
    // Convert map to array and sort by most recent meeting
    const recentParticipants = Array.from(participantMap.values())
      .sort((a, b) => new Date(b.lastMeetupAt).getTime() - new Date(a.lastMeetupAt).getTime())
      .slice(0, 100);

    // Check if these users are already friends with the current user
    const friendIds = await db
      .select({
        friendId: friends.friend_id,
      })
      .from(friends)
      .where(eq(friends.user_id, userId));

    const friendIdSet = new Set(friendIds.map(f => f.friendId));

    // Add isFriend flag to each participant
    const recentParticipantsWithFriendFlag = recentParticipants.map(participant => ({
      ...participant,
      isFriend: friendIdSet.has(participant.id)
    }));

    return res.json(recentParticipantsWithFriendFlag);
  } catch (error) {
    console.error("Failed to get recent meetup participants:", error);
    return res.status(500).json({ 
      error: "Failed to get recent meetup participants",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;