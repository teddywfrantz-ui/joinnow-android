import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

type MessageType = 
  | 'chat' 
  | 'join_request' 
  | 'request_update' 
  | 'participant_left' 
  | 'location_update' 
  | 'join' 
  | 'friend_request' 
  | 'friend_request_update' 
  | 'typing' 
  | 'stop_typing'
  | 'meetup_disbanded'
  | 'meetup_completed'
  | 'request_accepted'
  | 'request_rejected'
  | 'request_canceled'
  | 'reaction';

interface BaseMessage {
  type: MessageType;
  meetupId?: number;
  timestamp?: number;
}

export interface ChatMessage extends BaseMessage {
  type: 'chat';
  userId: number | null;
  username: string;
  content: string;
  createdAt?: string;
  messageId?: string;
  profilePicture?: string | null;
}

export interface RequestMessage extends BaseMessage {
  type: 'join_request' | 'request_update' | 'friend_request' | 'friend_request_update' | 'request_accepted' | 'request_rejected' | 'request_canceled';
  userId: number;
  username?: string;
  requestId?: number;
  status?: 'accepted' | 'rejected' | 'pending' | 'cancelled';
  title?: string;
  message?: string;
  profilePicture?: string | null;
}

export interface ParticipantMessage extends BaseMessage {
  type: 'participant_left' | 'meetup_disbanded' | 'meetup_completed';
  userId?: number;
  username?: string;
  title?: string;
  message?: string;
  profilePicture?: string | null;
}

export interface LocationMessage extends BaseMessage {
  type: 'location_update';
  userId: number | null;
  username: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

export interface JoinMessage extends BaseMessage {
  type: 'join';
  meetupId: number;
}

export interface TypingMessage extends BaseMessage {
  type: 'typing' | 'stop_typing';
  username: string;
  profilePicture?: string | null;
}

export interface ReactionMessage extends BaseMessage {
  type: 'reaction';
  userId: number;
  username: string;
  messageId: string;
  emoji: string;
  profilePicture?: string | null;
}

export type WebSocketMessage = 
  | ChatMessage 
  | RequestMessage 
  | ParticipantMessage 
  | LocationMessage 
  | JoinMessage 
  | TypingMessage
  | ReactionMessage;

type MessageCallback = (message: WebSocketMessage) => void;

async function getValidAccessToken(): Promise<string> {
  try {
    let tokens = JSON.parse(localStorage.getItem('jwt_tokens') || 'null');
    if (!tokens?.accessToken) {
      const sessionTokenResponse = await fetch('/api/session-token', {
        credentials: 'include',
      });
      if (!sessionTokenResponse.ok) return '';
      const sessionTokens = await sessionTokenResponse.json();
      tokens = { accessToken: sessionTokens.accessToken };
      localStorage.setItem('jwt_tokens', JSON.stringify(tokens));
    }

    const payloadPart = tokens.accessToken.split('.')[1];
    const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + 60_000) {
      return tokens.accessToken;
    }
    if (!tokens.refreshToken) {
      localStorage.removeItem('jwt_tokens');
      return '';
    }

    const response = await fetch('/api/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      credentials: 'include',
    });
    if (!response.ok) {
      localStorage.removeItem('jwt_tokens');
      return '';
    }
    const rotatedTokens = await response.json();
    localStorage.setItem('jwt_tokens', JSON.stringify(rotatedTokens));
    return rotatedTokens.accessToken || '';
  } catch {
    localStorage.removeItem('jwt_tokens');
    return '';
  }
}

export function useWebSocket(meetupId?: number) {
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const isConnecting = useRef(false);
  const callbacks = useRef<Set<MessageCallback>>(new Set());
  const messageQueue = useRef<Array<{ message: WebSocketMessage; timestamp: number }>>([]); 
  const seenMessageIds = useRef<Set<string>>(new Set());
  const authenticated = useRef(false);
  const joinedMeetup = useRef<number | null>(null);

  const processQueuedMessages = useCallback(() => {
    messageQueue.current.sort((a, b) => a.timestamp - b.timestamp);

    while (messageQueue.current.length > 0) {
      const queueItem = messageQueue.current.shift();
      if (queueItem && ws.current?.readyState === WebSocket.OPEN) {
        const { message } = queueItem;

        if (message.type === 'chat' && message.messageId) {
          if (seenMessageIds.current.has(message.messageId)) {
            continue;
          }
          seenMessageIds.current.add(message.messageId);
        }

        ws.current.send(JSON.stringify(message));
      }
    }
  }, []);

  const connectWebSocket = useCallback(async () => {
    if (isConnecting.current || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnecting.current = true;
    authenticated.current = false;
    joinedMeetup.current = null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const accessToken = await getValidAccessToken();
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      if (ws.current) {
        ws.current.close();
      }

      console.log('Creating new WebSocket connection...');
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connection opened');
        reconnectAttempts.current = 0;
        isConnecting.current = false;

        if (accessToken && ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'authenticate', token: accessToken }));
        } else {
          processQueuedMessages();
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          if ((message as any).type === 'authenticated') {
            authenticated.current = true;
            if (meetupId && ws.current?.readyState === WebSocket.OPEN) {
              console.log('Joining meetup room:', meetupId);
              ws.current.send(JSON.stringify({ type: 'join', meetupId } satisfies JoinMessage));
            } else {
              processQueuedMessages();
            }
            return;
          }
          if ((message as any).type === 'joined') {
            joinedMeetup.current = meetupId ?? null;
            processQueuedMessages();
            return;
          }
          
          // Enhanced logging for message received
          if (message.type === 'reaction') {
            console.log('🎯 WebSocket - Reaction message received:', {
              type: message.type,
              meetupId: message.meetupId,
              messageId: (message as ReactionMessage).messageId,
              emoji: (message as ReactionMessage).emoji,
              username: message.username,
              timestamp: message.timestamp || Date.now()
            });
          } else {
            console.log('WebSocket - Message received:', {
              type: message.type,
              meetupId: message.meetupId,
              timestamp: message.timestamp || Date.now(),
              userId: (message as any).userId,
              requestId: (message as any).requestId
            });
          }

          // Deduplicate chat messages by messageId
          if (message.type === 'chat' && message.messageId) {
            if (seenMessageIds.current.has(message.messageId)) {
              console.log('WebSocket - Ignoring duplicate chat message', message.messageId);
              return;
            }
            seenMessageIds.current.add(message.messageId);
          }

          // Distribute the message to all registered callbacks
          callbacks.current.forEach(callback => {
            try {
              callback(message);
            } catch (err) {
              console.error('WebSocket - Error in message callback:', err);
            }
          });
        } catch (err) {
          console.error('WebSocket - Failed to parse message:', err, {
            rawData: typeof event.data === 'string' && event.data.length < 1000 ? event.data : '[data too large]'
          });
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnecting.current = false;

        if (reconnectAttempts.current < maxReconnectAttempts) {
          console.log('Attempting immediate reconnection after error...');
          setTimeout(connectWebSocket, 1000);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        isConnecting.current = false;
        authenticated.current = false;
        joinedMeetup.current = null;
        ws.current = null;

        if (event.code === 1008) {
          console.warn('WebSocket authorization rejected; reconnect disabled');
          return;
        }

        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
          console.log(`Attempting reconnection in ${backoffTime}ms...`);
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, backoffTime);
        } else {
          console.log('Max reconnection attempts reached');
          toast({
            title: "Connection Lost",
            description: "Unable to connect to server. Please refresh the page.",
            variant: "destructive"
          });
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      isConnecting.current = false;
    }
  }, [meetupId, toast, processQueuedMessages]);

  useEffect(() => {
    if (seenMessageIds.current.size > 1000) {
      const messageIds = Array.from(seenMessageIds.current);
      seenMessageIds.current = new Set(messageIds.slice(-500));
    }

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connectWebSocket]);

  const subscribe = useCallback((callback: MessageCallback) => {
    callbacks.current.add(callback);
    return () => {
      callbacks.current.delete(callback);
    };
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    // Always generate a unique message ID for chat messages if not already provided
    const enhancedMessage = {
      ...message,
      timestamp: Date.now(),
      ...(message.type === 'chat' && !message.messageId && {
        messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      })
    };

    try {
      const roomScoped = message.type !== 'join_request' &&
        message.type !== 'request_update' &&
        message.type !== 'friend_request' &&
        message.type !== 'friend_request_update' &&
        typeof message.meetupId === 'number';
      const protocolReady = authenticated.current &&
        (!roomScoped || joinedMeetup.current === message.meetupId);

      // Send only after authentication and, for room events, the joined ack.
      if (ws.current?.readyState === WebSocket.OPEN && protocolReady) {
        ws.current.send(JSON.stringify(enhancedMessage));
        console.log('WebSocket - Message sent successfully:', {
          type: enhancedMessage.type,
          meetupId: enhancedMessage.meetupId,
          timestamp: enhancedMessage.timestamp
        });
      } else {
        // Log detailed connection state
        console.warn('WebSocket - Cannot send message, connection not ready:', {
          readyState: ws.current?.readyState ? 
            ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.current.readyState] : 'NULL',
          connectionExists: !!ws.current,
          messageType: enhancedMessage.type,
          messageDetails: enhancedMessage,
          queueLength: messageQueue.current.length
        });
        
        // Queue the message for later sending
        messageQueue.current.push({
          message: enhancedMessage,
          timestamp: Date.now()
        });
        
        // Attempt to reconnect if no connection exists
        connectWebSocket();
      }
    } catch (error) {
      console.error('WebSocket - Error sending message:', error, {
        messageType: enhancedMessage.type,
        meetupId: enhancedMessage.meetupId
      });
      
      // Queue the message for retry
      messageQueue.current.push({
        message: enhancedMessage,
        timestamp: Date.now()
      });
      
      // Attempt to reconnect on error
      connectWebSocket();
    }
  }, [connectWebSocket]);

  return { sendMessage, subscribe };
}