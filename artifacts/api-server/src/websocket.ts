import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db, messages, users } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { verifyToken } from "./services/jwt-service";
import { meetupParticipants, joinRequests, meetups } from "@workspace/db";

interface WsMessage {
  type: 'authenticate' | 'chat' | 'join_request' | 'request_update' | 'participant_left' | 'location_update' | 'join' | 'friend_request' | 'friend_request_update' | 'typing' | 'stop_typing' | 'reaction';
  token?: string;
  meetupId?: number;
  userId?: number | null;
  content?: string;
  username?: string;
  requestId?: number;
  status?: 'accepted' | 'rejected' | 'pending';
  title?: string;
  message?: string;
  recipientId?: number;
  timestamp?: number;
  messageId?: string;
  profilePicture?: string | null;
  emoji?: string;
  reactions?: Record<string, string[]>;
}

interface WsClient extends WebSocket {
  meetupId?: number;
  userId?: number | null;
  username?: string;
  isAlive?: boolean;
  messageQueue?: WsMessage[];
  authenticated?: boolean;
  messageWindowStartedAt?: number;
  messageCount?: number;
}

export function setupWebSocket(server: Server) {
  console.log('Setting up WebSocket server...');

  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
    verifyClient: ({ req }: { req: any }) => {
      const protocol = req.headers['sec-websocket-protocol'];
      return !protocol?.includes('vite-hmr');
    }
  });

  const userClients = new Map<number, Set<WsClient>>();
  const meetupClients = new Map<number, Set<WsClient>>();
  const typingUsers = new Map<number, Set<string>>();
  const messageHistory = new Map<number, Set<string>>();

  const heartbeatInterval = setInterval(() => {
    if (wss.clients.size === 0) return; // Nothing connected = don't do anything

    wss.clients.forEach((ws: WsClient) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('error', (error) => {
    console.error('WebSocket Server Error:', error);
  });

  wss.on('connection', (ws: WsClient, req: any) => {
    console.log("✅ WebSocket Connection from:", req.socket.remoteAddress);
    ws.isAlive = true;
    ws.messageQueue = [];
    ws.userId = null;
    ws.authenticated = false;
    ws.messageWindowStartedAt = Date.now();
    ws.messageCount = 0;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        const rawMessage = data.toString();
        if (Buffer.byteLength(rawMessage, "utf8") > 64 * 1024) {
          ws.close(1009, "Message too large");
          return;
        }
        const now = Date.now();
        if (!ws.messageWindowStartedAt || now - ws.messageWindowStartedAt >= 60_000) {
          ws.messageWindowStartedAt = now;
          ws.messageCount = 0;
        }
        ws.messageCount = (ws.messageCount ?? 0) + 1;
        if (ws.messageCount > 180) {
          ws.close(1008, "Rate limit exceeded");
          return;
        }
        const message = JSON.parse(rawMessage) as WsMessage;
        console.log('Received WebSocket message:', { type: message.type, meetupId: message.meetupId });

        if (message.type === 'authenticate') {
          const payload = message.token ? verifyToken(message.token) : null;
          if (!payload || payload.tokenType !== 'access') {
            ws.send(JSON.stringify({ type: 'error', error: 'Invalid or expired access token' }));
            ws.close(1008, 'Authentication failed');
            return;
          }
          const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId) });
          if (!user) {
            ws.close(1008, 'User not found');
            return;
          }
          ws.userId = user.id;
          ws.username = user.username;
          ws.authenticated = true;
          let userSockets = userClients.get(user.id);
          if (!userSockets) {
            userSockets = new Set();
            userClients.set(user.id, userSockets);
          }
          userSockets.add(ws);
          ws.send(JSON.stringify({ type: 'authenticated' }));
          return;
        }

        if (!ws.authenticated || ws.userId == null) {
          ws.send(JSON.stringify({ type: 'error', error: 'Authentication required' }));
          return;
        }

        if (message.type === 'join' && message.meetupId) {
          const [meetup] = await db
            .select({
              creatorId: meetups.creator_id,
              expiresAt: meetups.expiresAt,
            })
            .from(meetups)
            .where(eq(meetups.id, message.meetupId))
            .limit(1);
          const participant = ws.userId ? await db.query.meetupParticipants.findFirst({ where: and(eq(meetupParticipants.meetup_id, message.meetupId), eq(meetupParticipants.user_id, ws.userId)) }) : null;
          if (
            !ws.authenticated ||
            !meetup ||
            meetup.expiresAt <= new Date() ||
            (meetup.creatorId !== ws.userId && !participant)
          ) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not authorized for this meetup' }));
            ws.close(1008, 'Not authorized');
            return;
          }
          let clients = meetupClients.get(message.meetupId);
          if (!clients) {
            clients = new Set();
            meetupClients.set(message.meetupId, clients);
          }
          ws.meetupId = message.meetupId;
          clients.add(ws);
          console.log(`✅ Client joined meetup room ${message.meetupId}, total clients: ${clients.size}`);

          if (ws.messageQueue?.length) {
            const meetupMessages = ws.messageQueue.filter(msg => msg.meetupId === message.meetupId);
            for (const queuedMessage of meetupMessages) {
              await handleChatMessage(ws, queuedMessage, meetupClients, messageHistory);
            }
            ws.messageQueue = ws.messageQueue.filter(msg => msg.meetupId !== message.meetupId);
          }
          ws.send(JSON.stringify({ type: 'joined', meetupId: message.meetupId }));
          return;
        }

        if (ws.userId !== null && ws.userId !== undefined) {
          let userSockets = userClients.get(ws.userId);
          if (!userSockets) {
            userSockets = new Set();
            userClients.set(ws.userId, userSockets);
          }
          userSockets.add(ws);
          message.userId = ws.userId;
          message.username = ws.username;
        }

        const roomScopedTypes = new Set([
          'chat',
          'typing',
          'stop_typing',
          'location_update',
          'participant_left',
          'reaction',
        ]);
        if (
          message.meetupId &&
          roomScopedTypes.has(message.type) &&
          (!ws.authenticated || ws.meetupId !== message.meetupId)
        ) {
          ws.send(JSON.stringify({ type: 'error', error: 'Join an authorized meetup before sending room events' }));
          return;
        }
        if (
          (message.type === 'join_request' || message.type === 'request_update') &&
          (!ws.authenticated || ws.userId === null || ws.userId === undefined)
        ) {
          ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for request events' }));
          return;
        }
        if (
          (message.type === 'friend_request' || message.type === 'friend_request_update') &&
          (!ws.authenticated || ws.userId === null || ws.userId === undefined)
        ) {
          ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for user events' }));
          return;
        }

        switch (message.type) {
          case 'chat':
            if (!ws.authenticated || !ws.meetupId || ws.meetupId !== message.meetupId) {
              ws.send(JSON.stringify({ type: 'error', error: 'Join an authorized meetup before chatting' }));
              break;
            }
            if (!message.timestamp) {
              message.timestamp = Date.now();
            }
            if (ws.userId !== null && ws.userId !== undefined) {
              message.userId = ws.userId;
              message.username = ws.username;
              await handleChatMessage(ws, message, meetupClients, messageHistory);
            } else {
              const anonymousMessage = {
                type: 'chat',
                meetupId: message.meetupId,
                userId: null,
                username: message.username || 'Anonymous',
                content: message.content,
                timestamp: message.timestamp || Date.now(),
                messageId: message.messageId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                profilePicture: message.profilePicture || null
              };
              if (message.meetupId) {
                broadcastToMeetup(message.meetupId, anonymousMessage, meetupClients);
              }
            }
            break;
          case 'location_update': {
            const [user] = await db
              .select({ settings: users.settings })
              .from(users)
              .where(eq(users.id, ws.userId))
              .limit(1);
            const privacy = (user?.settings as { privacy?: { allowLocationSharing?: boolean } } | null)?.privacy;
            if (privacy?.allowLocationSharing === false) {
              ws.send(JSON.stringify({ type: 'error', error: 'Location sharing is disabled in your privacy settings' }));
              break;
            }
            await broadcastMeetupUpdate(message, meetupClients);
            break;
          }
          case 'typing':
          case 'stop_typing':
            handleTypingStatus(message, meetupClients, typingUsers);
            break;
          case 'friend_request':
          case 'friend_request_update':
            if (message.userId !== null && message.recipientId !== undefined) {
              await broadcastFriendRequestUpdate(message, userClients);
            }
            break;
          case 'join_request':
          case 'request_update':
            if (ws.userId !== null && ws.userId !== undefined) {
              await broadcastRequestUpdate(ws, message, userClients);
            }
            break;
          case 'participant_left':
            await broadcastMeetupUpdate(message, meetupClients);
            break;
          case 'reaction':
            if (message.meetupId && message.messageId && message.emoji && message.username) {
              const requestId = Date.now();
              console.log(`🔸 [ReactionHandler ${requestId}] Processing reaction message:`, {
                meetupId: message.meetupId,
                messageId: message.messageId,
                emoji: message.emoji,
                username: message.username
              });

              try {
                // First, find the message in the database
                console.log(`🔍 [ReactionHandler ${requestId}] Looking up message ID: ${message.messageId}`);
                const messageResult = await db.execute(sql`
                  SELECT * FROM messages 
                  WHERE meetup_id = ${message.meetupId}
                  AND (message_id = ${message.messageId}
                  OR id = ${parseInt(message.messageId, 10)}
                  )
                `);

                if (messageResult.rows?.length > 0) {
                  // Get the existing message with reactions
                  const dbMessage = messageResult.rows[0];
                  console.log(`✅ [ReactionHandler ${requestId}] Found message in database:`, {
                    id: dbMessage.id,
                    messageId: dbMessage.message_id,
                    hasReactions: !!dbMessage.reactions,
                    reactionsType: typeof dbMessage.reactions
                  });

                  // Initialize or use existing reactions with improved handling
                  let reactions: Record<string, string[]> = {};

                  // Process reactions data from database
                  if (dbMessage.reactions) {
                    try {
                      if (typeof dbMessage.reactions === 'object') {
                        console.log(`⚙️ [ReactionHandler ${requestId}] Using reactions as object`);
                        reactions = dbMessage.reactions as Record<string, string[]>;
                      } else if (typeof dbMessage.reactions === 'string') {
                        console.log(`⚙️ [ReactionHandler ${requestId}] Parsing reactions from string: ${dbMessage.reactions}`);
                        reactions = JSON.parse(dbMessage.reactions);
                      }
                    } catch (parseError) {
                      console.error(`❌ [ReactionHandler ${requestId}] Failed to parse reactions:`, parseError);
                      // Reset to empty object on parse error
                      reactions = {};
                    }
                  }

                  const emoji = message.emoji as string;
                  const username = message.username as string;

                  console.log(`🔄 [ReactionHandler ${requestId}] Current reactions state:`, reactions);

                  // Create or update the reaction array for this emoji
                  if (!reactions[emoji]) {
                    reactions[emoji] = [];
                    console.log(`🆕 [ReactionHandler ${requestId}] Created new emoji array for ${emoji}`);
                  }

                  // Check if user already reacted with this emoji
                  const userIndex = reactions[emoji].indexOf(username);

                  // Toggle the reaction
                  if (userIndex === -1) {
                    // Add user to reactions for this emoji
                    reactions[emoji].push(username);
                    console.log(`➕ [ReactionHandler ${requestId}] Added ${username} to ${emoji} reactions`);
                  } else {
                    // Remove user from reactions for this emoji
                    reactions[emoji].splice(userIndex, 1);
                    console.log(`➖ [ReactionHandler ${requestId}] Removed ${username} from ${emoji} reactions`);
                  }

                  // If the emoji array is empty, clean it up
                  if (reactions[emoji].length === 0) {
                    delete reactions[emoji];
                    console.log(`🗑️ [ReactionHandler ${requestId}] Removed empty emoji entry: ${emoji}`);
                  }

                  // Update the message with new reactions
                  const reactionsJson = JSON.stringify(reactions);
                  console.log(`📝 [ReactionHandler ${requestId}] Updating database with reactions:`, reactionsJson);

                  await db.execute(sql`
                    UPDATE messages
                    SET reactions = ${reactionsJson}::jsonb
                    WHERE id = ${dbMessage.id}
                  `);

                  console.log(`✅ [ReactionHandler ${requestId}] Successfully updated reactions in database`);

                  // Create a reaction message to broadcast
                  const reactionMessage = {
                    type: 'reaction',
                    meetupId: message.meetupId,
                    userId: message.userId,
                    username: message.username,
                    messageId: message.messageId,
                    emoji: message.emoji,
                    timestamp: message.timestamp || Date.now(),
                    profilePicture: message.profilePicture || null,
                    reactions: reactions
                  };

                  console.log(`📣 [ReactionHandler ${requestId}] Broadcasting reaction update to meetup ${message.meetupId}`);
                  broadcastToMeetup(message.meetupId, reactionMessage, meetupClients);
                } else {
                  console.error(`❌ [ReactionHandler ${requestId}] Message not found for reaction: ${message.messageId}`);
                }
              } catch (error) {
                console.error(`❌ [ReactionHandler ${requestId}] Error processing reaction:`, error);
              }
            } else {
              console.error("❌ Invalid reaction message format:", message);
            }
            break;
        }
      } catch (err) {
        console.error('❌ WebSocket message error:', err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Failed to process message'
          }));
        }
      }
    });

    ws.on('error', (error) => {
      console.error("❌ WebSocket Client Error:", error);
    });

    ws.on('close', () => {
      console.warn('❌ WebSocket Connection Closed');
      cleanupClient(ws, userClients, meetupClients, typingUsers);
    });
  });

}

async function handleChatMessage(
  ws: WsClient, 
  message: WsMessage, 
  meetupClients: Map<number, Set<WsClient>>,
  messageHistory: Map<number, Set<string>>
) {
  if (!message.userId || !message.meetupId) {
    console.error('❌ Missing userId or meetupId in message');
    return;
  }

  let meetupMessages = messageHistory.get(message.meetupId);
  if (!meetupMessages) {
    meetupMessages = new Set();
    messageHistory.set(message.meetupId, meetupMessages);
  }

  if (message.messageId && meetupMessages.has(message.messageId)) {
    console.log('Duplicate message detected, skipping:', message.messageId);
    return;
  }

  try {
    // Generate a messageId if not provided
    const messageId = message.messageId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Use raw SQL to handle the snake_case column names and add message_id
    const savedMessageResult = await db.execute(sql`
      INSERT INTO messages (meetup_id, user_id, content, created_at, message_id, reactions)
      VALUES (${message.meetupId}, ${message.userId}, ${message.content || ''}, NOW(), ${messageId}, '{}')
      RETURNING *
    `);

    // Make sure we have a valid savedMessage with proper type safety
    const savedMessage = savedMessageResult.rows?.[0] || {
      id: 0,
      meetup_id: message.meetupId,
      user_id: message.userId,
      content: message.content || '',
      created_at: new Date(),
      message_id: messageId,
      reactions: {} as Record<string, string[]>
    };

    // Ensure created_at is properly handled as a Date
    const createdAt = savedMessage.created_at instanceof Date 
      ? savedMessage.created_at 
      : typeof savedMessage.created_at === 'string'
        ? new Date(savedMessage.created_at)
        : new Date();

    console.log('✅ Saved message:', savedMessage);

    // Map from snake_case to camelCase for client consumption
    const outboundMessage = {
      type: 'chat',
      id: savedMessage.id,
      meetupId: savedMessage.meetup_id,
      userId: savedMessage.user_id,
      username: ws.username,
      content: savedMessage.content,
      createdAt: createdAt.toISOString(),
      timestamp: message.timestamp || Date.now(),
      messageId: savedMessage.message_id || messageId,
      profilePicture: message.profilePicture || null,
      reactions: savedMessage.reactions && typeof savedMessage.reactions === 'object' 
        ? savedMessage.reactions as Record<string, string[]>
        : {} as Record<string, string[]>
    };

    const messageIdString = typeof outboundMessage.messageId === 'string' 
      ? outboundMessage.messageId 
      : String(outboundMessage.messageId);

    if (messageIdString) {
      meetupMessages.add(messageIdString);

      if (meetupMessages.size > 1000) {
        const oldestMessages = Array.from(meetupMessages).slice(0, 500);
        oldestMessages.forEach(id => meetupMessages.delete(id));
      }
    }

    broadcastToMeetup(message.meetupId, outboundMessage, meetupClients);
  } catch (error) {
    console.error('❌ Failed to save message:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to save message'
      }));
    }
  }
}

function cleanupClient(
  ws: WsClient,
  userClients: Map<number, Set<WsClient>>,
  meetupClients: Map<number, Set<WsClient>>,
  typingUsers: Map<number, Set<string>>
) {
  if (ws.meetupId) {
    const clients = meetupClients.get(ws.meetupId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        meetupClients.delete(ws.meetupId);
      }
    }
  }

  if (ws.userId) {
    const userSockets = userClients.get(ws.userId);
    if (userSockets) {
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        userClients.delete(ws.userId);
      }
    }
  }

  if (ws.meetupId && ws.username) {
    const typingSet = typingUsers.get(ws.meetupId);
    if (typingSet) {
      typingSet.delete(ws.username);
      if (typingSet.size === 0) {
        typingUsers.delete(ws.meetupId);
      }
    }
  }
}

function handleTypingStatus(
  message: WsMessage,
  meetupClients: Map<number, Set<WsClient>>,
  typingUsers: Map<number, Set<string>>
) {
  if (!message.meetupId || !message.username) return;

  let typingSet = typingUsers.get(message.meetupId);
  if (!typingSet) {
    typingSet = new Set();
    typingUsers.set(message.meetupId, typingSet);
  }

  if (message.type === 'typing') {
    typingSet.add(message.username);
  } else {
    typingSet.delete(message.username);
  }

  const typingMessage = {
    type: message.type,
    meetupId: message.meetupId,
    username: message.username,
    typingUsers: Array.from(typingSet),
    profilePicture: message.profilePicture || null
  };

  broadcastToMeetup(message.meetupId, typingMessage, meetupClients);
}

function broadcastToMeetup(meetupId: number, message: any, meetupClients: Map<number, Set<WsClient>>) {
  const outbound = JSON.stringify(message);
  console.log('Broadcasting message:', outbound);

  const clients = meetupClients.get(meetupId);
  if (clients) {
    console.log(`✅ Broadcasting to ${clients.size} clients in meetup ${meetupId}`);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(outbound);
      } else {
        clients.delete(client);
      }
    });
  } else {
    console.log(`❌ No clients found for meetup ${meetupId}`);
  }
}

async function broadcastFriendRequestUpdate(message: WsMessage, userClients: Map<number, Set<WsClient>>) {
  if (!message.recipientId) {
    console.error('❌ Missing recipientId in friend request message');
    return;
  }

  const outboundMessage = {
    type: message.type,
    userId: message.userId,
    username: message.username,
    requestId: message.requestId,
    status: message.status,
    title: message.title,
    message: message.message,
    profilePicture: message.profilePicture || null
  };

  const recipientClients = userClients.get(message.recipientId);
  if (recipientClients) {
    const outbound = JSON.stringify(outboundMessage);
    recipientClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(outbound);
      }
    });
  }
}

async function broadcastRequestUpdate(
  sender: WsClient,
  message: WsMessage,
  userClients: Map<number, Set<WsClient>>,
) {
  if (!message.meetupId || !message.requestId || sender.userId == null) return;

  const [request] = await db
    .select({
      id: joinRequests.id,
      meetupId: joinRequests.meetup_id,
      requesterId: joinRequests.user_id,
      status: joinRequests.status,
      creatorId: meetups.creator_id,
    })
    .from(joinRequests)
    .innerJoin(meetups, eq(joinRequests.meetup_id, meetups.id))
    .where(and(
      eq(joinRequests.id, message.requestId),
      eq(joinRequests.meetup_id, message.meetupId),
    ))
    .limit(1);

  if (!request) return;

  const recipientId = message.type === 'join_request'
    ? request.creatorId
    : request.requesterId;
  const authorized = message.type === 'join_request'
    ? sender.userId === request.requesterId && request.status === 'pending'
    : sender.userId === request.creatorId;

  if (!authorized || recipientId == null) return;

  const outboundMessage = {
    type: message.type,
    meetupId: request.meetupId,
    userId: request.requesterId,
    username: sender.username,
    requestId: request.id,
    status: request.status,
    title: message.title,
    message: message.message,
    profilePicture: message.profilePicture || null
  };

  userClients.get(recipientId)?.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(outboundMessage));
    }
  });

}

async function broadcastMeetupUpdate(message: WsMessage, meetupClients: Map<number, Set<WsClient>>) {
  if (!message.meetupId) return;

  const outboundMessage = {
    type: message.type,
    meetupId: message.meetupId,
    title: message.title,
    message: message.message,
    username: message.username,
    userId: message.userId,
    profilePicture: message.profilePicture || null
  };

  broadcastToMeetup(message.meetupId, outboundMessage, meetupClients);
}