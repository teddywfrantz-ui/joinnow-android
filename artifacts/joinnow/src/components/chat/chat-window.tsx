import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  useWebSocket, 
  ReactionMessage, 
  WebSocketMessage,
  ChatMessage as WebsocketChatMessage
} from '@/hooks/use-websocket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { MessageSquare, Loader2, CheckCircle2, Clock, AlertCircle, Send, RefreshCw, Smile, SmilePlus, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UserProfileModal } from "@/components/users/user-profile-modal";

interface ChatMessage {
  id?: number;
  meetupId: number;
  userId: number;
  username: string;
  content: string;
  createdAt: string;
  status?: 'sending' | 'sent' | 'error';
  isRead?: boolean;
  messageId?: string;
  timestamp?: number;
  profilePicture?: string | null;
  displayName?: string;
  reactions?: Record<string, string[]>; // emoji -> username array for each reaction
}

interface ChatWindowProps {
  meetupId: number;
  currentUserId: number;
  currentUsername: string;
  currentUserPicture?: string | null;
  isMobileChat?: boolean;
  showToggleDetails?: boolean;
  readOnly?: boolean;
  statusMessage?: string;
}

export function ChatWindow({
  meetupId,
  currentUserId,
  currentUsername,
  currentUserPicture,
  isMobileChat,
  showToggleDetails = true,
  readOnly = false,
  statusMessage,
}: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [isError, setIsError] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const lastMessageRef = useRef<string>('');
  // Create a ref to store all reactions in-memory (since they're not persisted in the database)
  const reactionsMapRef = useRef<{[messageId: string]: {[emoji: string]: string[]}}>({}); 
  const { toast } = useToast();

  const queryClient = useQueryClient();
  const queryKey = [`/api/meetups/${meetupId}/messages`];

  const { data: messages = [], isLoading, error, refetch } = useQuery<ChatMessage[]>({
    queryKey,
    queryFn: async () => {
      try {
        const response = await fetch(`/api/meetups/${meetupId}/messages`);
        if (!response.ok) throw new Error('Failed to fetch messages');
        const data = await response.json();
        // Process server messages to ensure consistent formatting
        return data.map((msg: ChatMessage) => {
          // Ensure the content is properly sanitized and formatted
          const processedContent = msg.content.trim();
          
          return {
            ...msg,
            content: processedContent,
            timestamp: new Date(msg.createdAt).getTime(),
            messageId: msg.messageId || `legacy-${msg.id}`,
          };
        });
      } catch (error) {
        console.error('Error fetching messages:', error);
        setIsError(true);
        throw error;
      }
    },
    staleTime: 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
    retry: 3
  });

  useEffect(() => {
    if (messages?.length > 0) {
      setLocalMessages(prev => {
        // Keep any sending messages from the current state
        const sendingMessages = prev.filter(msg => msg.status === 'sending');
        
        // Process server messages, ensuring proper typing of the status property
        const processedServerMessages = messages.map(msg => {
          // Initialize reactionsMapRef with reactions from server
          if (msg.messageId && msg.reactions) {
            reactionsMapRef.current[msg.messageId] = msg.reactions;
          }
          
          return {
            ...msg,
            status: 'sent' as const, // Using const assertion to ensure correct type
            timestamp: msg.timestamp || new Date(msg.createdAt).getTime(),
            // Ensure reactions are preserved
            reactions: msg.reactions || {}
          };
        });
        
        // Combine and sort all messages
        return [...processedServerMessages, ...sendingMessages]
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      });
    }
  }, [messages]);

  // Historical transcripts load over HTTP and must never join a live room.
  const { sendMessage, subscribe } = useWebSocket(readOnly ? undefined : meetupId);

  // Enhanced scroll to bottom function with added reliability - improved for mobile
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current;
      
      // First attempt - standard method
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      
      // Second attempt with a slight delay to ensure rendering completes
      setTimeout(() => {
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      }, 50);

      // Third attempt with more delay for mobile devices
      setTimeout(() => {
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      }, 300);
      
      // Attempt for ScrollArea viewport element which might be different from the ref
      const viewport = scrollElement.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
        setTimeout(() => viewport.scrollTop = viewport.scrollHeight, 100);
      }
      
      // Global fallback for mobile
      if (isMobileChat) {
        window.scrollTo(0, document.body.scrollHeight);
      }
    }
  }, [isMobileChat]);

  // Multiple attempts to ensure scrolling works correctly
  useEffect(() => {
    // Initial scroll
    scrollToBottom(false);
    
    // Secondary attempt after a short delay (for animations and DOM updates)
    const timeout1 = setTimeout(() => scrollToBottom(false), 50);
    
    // Final attempt after layout is fully complete
    const timeout2 = setTimeout(() => scrollToBottom(false), 300);
    
    // Removed JavaScript positioning code since we now use absolute positioning
    // This makes the input stay within the chat container automatically
    
    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [localMessages, scrollToBottom, isMobileChat]);
  
  // Additional scroll to bottom on component load, when tab changes to chat, and actively watch for activeTab='chat'
  useEffect(() => {
    scrollToBottom(false);
    
    // Make extra sure we scroll to bottom when in mobile chat
    if (isMobileChat) {
      // Attempt multiple scroll events with different timing
      const timeouts = [
        setTimeout(() => scrollToBottom(false), 50),
        setTimeout(() => scrollToBottom(false), 100),
        setTimeout(() => scrollToBottom(false), 200),
        setTimeout(() => scrollToBottom(false), 300),
        setTimeout(() => scrollToBottom(false), 500),
        setTimeout(() => scrollToBottom(false), 800)
      ];
      
      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [scrollToBottom, isMobileChat]);
  
  // Focus on the mobile chat when it becomes visible
  useEffect(() => {
    if (isMobileChat) {
      scrollToBottom(false);
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [isMobileChat]);

  const handleTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setIsTyping(true);
    sendMessage({
      type: 'typing',
      meetupId,
      username: currentUsername,
      profilePicture: currentUserPicture
    });

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendMessage({
        type: 'stop_typing',
        meetupId,
        username: currentUsername,
        profilePicture: currentUserPicture
      });
    }, 1000);
  }, [meetupId, currentUsername, currentUserPicture, sendMessage]);

  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe((data: any) => {
      if (data.type === 'chat') {
        // Process incoming message content to ensure consistent formatting
        const processedContent = data.content?.trim() || '';

        const newMessage: ChatMessage = {
          id: data.id,
          meetupId: data.meetupId,
          userId: data.userId,
          username: data.username,
          content: processedContent,
          createdAt: data.createdAt || new Date().toISOString(),
          status: 'sent',
          isRead: false,
          messageId: data.messageId,
          timestamp: data.timestamp || Date.now(),
          profilePicture: data.profilePicture || null,
          reactions: data.reactions || {} // Ensure reactions are preserved
        };

        setLocalMessages(prev => {
          const existingIndex = prev.findIndex(msg => 
            (msg.messageId && msg.messageId === newMessage.messageId) ||
            (msg.content === newMessage.content && 
             msg.userId === newMessage.userId && 
             msg.status === 'sending')
          );

          if (existingIndex !== -1) {
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...newMessage, status: 'sent' };
            return updated;
          }

          return [...prev, newMessage].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        });

        if (data.userId !== currentUserId) {
          setTimeout(scrollToBottom, 100);
        }
      }
      else if (data.type === 'reaction' && data.messageId) {
        // Handle incoming reaction from other users
        setLocalMessages(prev => {
          return prev.map(msg => {
            if (msg.messageId === data.messageId || msg.id?.toString() === data.messageId) {
              const reactions = msg.reactions || {};
              const existingReactions = reactions[data.emoji] || [];
              
              // Add reaction if not already added
              if (!existingReactions.includes(data.username)) {
                return {
                  ...msg,
                  reactions: {
                    ...reactions,
                    [data.emoji]: [...existingReactions, data.username]
                  }
                };
              }
              
              // If it's a remove reaction operation
              if (existingReactions.includes(data.username)) {
                return {
                  ...msg,
                  reactions: {
                    ...reactions,
                    [data.emoji]: existingReactions.filter(name => name !== data.username)
                  }
                };
              }
            }
            return msg;
          });
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [meetupId, subscribe, currentUserId, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !message.trim() || isSending) return;

    const content = message.trim();
    if (content === lastMessageRef.current) {
      toast({
        title: "Duplicate message",
        description: "This message was already sent",
        variant: "default"
      });
      return;
    }

    lastMessageRef.current = content;
    setIsSending(true);

    try {
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = Date.now();

      const tempMessage: ChatMessage = {
        meetupId,
        userId: currentUserId,
        username: currentUsername,
        content,
        createdAt: new Date().toISOString(),
        status: 'sending',
        isRead: false,
        messageId,
        timestamp,
        profilePicture: currentUserPicture,
        reactions: {} // Initialize empty reactions object
      };

      setLocalMessages(prev => [...prev, tempMessage]);
      setMessage('');
      scrollToBottom(false);

      sendMessage({
        type: 'chat',
        content,
        meetupId,
        userId: currentUserId,
        username: currentUsername,
        messageId,
        timestamp,
        profilePicture: currentUserPicture
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsError(true);
      toast({
        title: "Failed to send message",
        description: "Please try again",
        variant: "destructive"
      });

      setLocalMessages(prev => {
        const lastIndex = prev.length - 1;
        if (lastIndex >= 0 && prev[lastIndex].status === 'sending') {
          const updatedMessages = [...prev];
          updatedMessages[lastIndex] = {
            ...updatedMessages[lastIndex],
            status: 'error'
          };
          return updatedMessages;
        }
        return prev;
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatMessageTime = (dateString: string) => {
    return format(new Date(dateString), 'h:mm a');
  };

  if (isLoading) {
    return (
      <>
        <div className="flex flex-col space-y-4 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
              <div className={cn(
                "rounded-lg p-4 max-w-[80%]",
                i % 2 === 0 ? "bg-primary/20" : "bg-muted"
              )}>
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          ))}
        </div>
        
        {/* UserProfileModal for profile picture clicks */}
        <UserProfileModal 
          userId={selectedUserId}
          open={showUserProfile}
          onOpenChange={setShowUserProfile}
        />
      </>
    );
  }

  if (isError || error) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <MessageSquare className="h-8 w-8 text-destructive mb-2" />
          <h3 className="font-semibold">Failed to load chat</h3>
          <p className="text-base text-muted-foreground mt-1 mb-4">
            Please try refreshing the chat
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              setIsError(false);
              setRetryCount(count => count + 1);
              refetch();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
        
        {/* UserProfileModal for profile picture clicks */}
        <UserProfileModal 
          userId={selectedUserId}
          open={showUserProfile}
          onOpenChange={setShowUserProfile}
        />
      </>
    );
  }

  // Common emojis for quick reactions
  const quickEmojis = ["👍", "👏", "❤️", "😂", "😮", "😢", "😡", "🎉", "👋", "🙏", "✅", "🔥", "⭐", "🤔"];
  
  // Helper to determine if a message contains only emojis
  const isEmojiOnlyMessage = (text: string) => {
    // Handle edge cases
    if (!text || typeof text !== 'string') return false;
    
    // Very simple check based on length and content
    const trimmed = text.trim();
    
    // Check if content is short and likely an emoji (just check if contains any of our quick emojis)
    const containsCommonEmoji = quickEmojis.some(emoji => trimmed.includes(emoji));
    
    // Or check if it's a short message (likely to be just emojis)
    return (containsCommonEmoji || trimmed.length <= 4) && 
           trimmed.length > 0 && trimmed.length <= 15 && 
           trimmed.split(' ').length <= 3; // Allows max 3 emoji with spaces
  };

  // Handler for sending reaction to a message
  const handleMessageReaction = (messageId: string | undefined, emoji: string) => {
    if (readOnly || !messageId || isSending) return;
    
    console.log(`Adding reaction: ${emoji} to message: ${messageId}`);
    
    // Initialize reactionsMap for this message if it doesn't exist
    if (!reactionsMapRef.current[messageId]) {
      reactionsMapRef.current[messageId] = {};
    }
    
    // Initialize the emoji array for this emoji if it doesn't exist
    if (!reactionsMapRef.current[messageId][emoji]) {
      reactionsMapRef.current[messageId][emoji] = [];
    }
    
    // Get existing reactions for this emoji on this message
    const existingReactions = reactionsMapRef.current[messageId][emoji];
    
    // Check if user already reacted with this emoji
    const hasReacted = existingReactions.includes(currentUsername);
    
    // Update the in-memory reactions map
    if (hasReacted) {
      console.log(`Removing user ${currentUsername} from ${emoji} reactions`);
      reactionsMapRef.current[messageId][emoji] = existingReactions.filter(name => name !== currentUsername);
    } else {
      console.log(`Adding user ${currentUsername} to ${emoji} reactions`);
      reactionsMapRef.current[messageId][emoji].push(currentUsername);
    }
    
    // Update local messages state to reflect the reaction change
    setLocalMessages(prev => {
      return prev.map(msg => {
        if (msg.messageId === messageId || msg.id?.toString() === messageId) {
          return {
            ...msg,
            reactions: { ...reactionsMapRef.current[messageId] }
          };
        }
        return msg;
      });
    });
    
    // Send reaction to server via websocket with detailed logging
    const reactionMessage: WebSocketMessage = {
      type: 'reaction' as const, // Use literal 'reaction' type to match TypeScript definition
      meetupId,
      userId: currentUserId,
      username: currentUsername,
      messageId,
      emoji,
      timestamp: Date.now(),
      profilePicture: currentUserPicture
    };
    
    console.log(`Sending reaction message via WebSocket:`, reactionMessage);
    
    // Send the message over WebSocket for real-time updates
    sendMessage(reactionMessage);
    
    // Also persist to the database with API call
    try {
      console.log(`Saving reaction to database via API for message: ${messageId}`);
      
      // Track if this is the start of the API call for debugging purposes
      const startTime = Date.now();
      
      fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          emoji, 
          userId: currentUserId,
          username: currentUsername
        }),
        credentials: 'include' // Important: Include credentials for auth sessions
      })
      .then(response => {
        const endTime = Date.now();
        console.log(`Reaction API response received in ${endTime - startTime}ms:`, { 
          status: response.status,
          ok: response.ok
        });
        
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log("Reaction saved successfully:", data);
        
        // Update with the server response to ensure consistency
        if (data.reactions) {
          // Update the local state with server data to ensure consistency
          reactionsMapRef.current[messageId] = data.reactions;
          
          // Also update local messages state with the server response
          setLocalMessages(prev => {
            return prev.map(msg => {
              if (msg.messageId === messageId || msg.id?.toString() === messageId) {
                return {
                  ...msg,
                  reactions: data.reactions
                };
              }
              return msg;
            });
          });
        }
      })
      .catch(error => {
        console.error("Error persisting reaction to server:", error);
        toast({
          title: "Error saving reaction",
          description: "Your reaction may not be saved permanently",
          variant: "destructive"
        });
      });
    } catch (error) {
      console.error("Error sending reaction to API:", error);
    }
  };
  
  // Handler for quick emoji messages
  const handleQuickEmoji = (emoji: string) => {
    if (readOnly || isSending) return;
    
    setIsSending(true);
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
      
    const emojiMessage: ChatMessage = {
      meetupId,
      userId: currentUserId,
      username: currentUsername,
      content: emoji,
      createdAt: new Date().toISOString(),
      status: 'sending',
      isRead: false,
      messageId,
      timestamp,
      profilePicture: currentUserPicture,
      reactions: {} // Initialize empty reactions object
    };

    setLocalMessages(prev => [...prev, emojiMessage]);
    scrollToBottom(false);
      
    sendMessage({
      type: 'chat',
      content: emoji,
      meetupId,
      userId: currentUserId,
      username: currentUsername,
      messageId,
      timestamp,
      profilePicture: currentUserPicture
    });

    setTimeout(() => setIsSending(false), 500);
  };

  return (
    <>
      <div className={cn(
        "flex flex-col relative overflow-hidden", 
        isMobileChat ? "h-[calc(100vh-12rem)]" : "min-h-[480px] h-[calc(100vh-15rem)]" // Ensure minimum height and better proportions
      )} id="chat-container">
        {/* Chat header removed to prevent duplication */}
        
        {/* Scrollable message area with padding to accommodate input footer */}
        <div 
          ref={scrollAreaRef}
          className={cn(
            "flex-1 px-4",
            "overflow-y-auto overscroll-contain hide-scrollbar",
            "h-[calc(100%-145px)]" // Fixed height calculation using pixels to ensure consistent sizing
          )}
          onScroll={(e) => {
            // Create custom event with detailed scroll information
            const target = e.currentTarget;
            const scrollTop = target.scrollTop;
            const scrollHeight = target.scrollHeight;
            const clientHeight = target.clientHeight;
            
            // Add info about scroll position to event
            const scrollEvent = new CustomEvent('chat-scroll', { 
              bubbles: true,
              detail: {
                scrollTop,
                scrollHeight,
                clientHeight,
                // Is near bottom (within 50px)
                isNearBottom: scrollHeight - scrollTop - clientHeight < 50,
                // Is near top (within 100px of top)
                isNearTop: scrollTop < 100,
                // Calculate scroll percentage 
                scrollPercentage: (scrollTop / (scrollHeight - clientHeight)) * 100
              }
            });
            
            // Dispatch to current element
            e.currentTarget.dispatchEvent(scrollEvent);
            
            // Also dispatch to document to ensure the parent can listen for it
            // This is especially important for mobile where the parent might not
            // directly receive bubbled events due to how scroll areas are implemented
            document.dispatchEvent(scrollEvent);
          }}
        >
          <div className="flex flex-col space-y-6 py-6 pb-[160px]"> {/* Extra bottom padding to ensure content isn't hidden behind input box */}
            {readOnly && statusMessage && (
              <div className="sticky top-2 z-10 mx-auto rounded-full border bg-background/95 px-4 py-2 text-center text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
                {statusMessage}
              </div>
            )}
            {showToggleDetails && (
              <button
                className="mx-auto mb-4 text-[15px] text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors"
                onClick={() => document.dispatchEvent(new CustomEvent('toggle-meetup-details'))}
              >
                <ChevronUp className="h-3 w-3" />
                <span>Toggle details</span>
              </button>
            )}
            {localMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              localMessages.map((msg, index) => (
                <div
                  key={msg.messageId || `${msg.id}-${index}`}
                  className={`flex mb-3 ${msg.userId === currentUserId ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Show avatar for other users' messages on the left */}
                  {msg.userId !== currentUserId && (
                    <div className="flex-shrink-0 mr-2 self-end mb-1">
                      <div onClick={(e) => e.stopPropagation()}>
                        <ProfileAvatar
                          profilePicture={msg.profilePicture}
                          username={msg.username}
                          displayName={msg.displayName}
                          size="sm"
                          onClick={() => {
                            if (msg.userId) {
                              setSelectedUserId(msg.userId);
                              setShowUserProfile(true);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Add avatar for current user's messages on the right */}
                  {msg.userId === currentUserId && (
                    <div className="flex-shrink-0 ml-2 self-end mb-1 order-last">
                      <div onClick={(e) => e.stopPropagation()}>
                        <ProfileAvatar
                          profilePicture={currentUserPicture || msg.profilePicture}
                          username={currentUsername}
                          size="sm"
                          onClick={() => {
                            if (currentUserId) {
                              setSelectedUserId(currentUserId);
                              setShowUserProfile(true);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col max-w-[85%] group relative">
                    {/* The message bubble content will be rendered here */}
                    {/* Message content */}
                  
                    <div
                      className={cn(
                        "rounded-lg px-4 py-2 max-w-full shadow-sm break-words",
                        msg.userId === currentUserId
                          ? isEmojiOnlyMessage(msg.content) 
                            ? "px-3 py-2 bg-primary text-primary-foreground" 
                            : "bg-primary text-primary-foreground"
                          : isEmojiOnlyMessage(msg.content)
                            ? "px-3 py-2 bg-background border"
                            : "bg-background border"
                      )}
                    >
                      {msg.userId !== currentUserId && !isEmojiOnlyMessage(msg.content) && (
                        <div className="text-[15px] font-medium mb-1">
                          {msg.displayName || msg.username}
                        </div>
                      )}
                      <div className="break-words leading-relaxed whitespace-pre-wrap text-[15px]">
                        {msg.content}
                      </div>
                      
                      {/* Message reactions with improved rendering */}
                      {(() => {
                        // Enhanced reactions rendering with proper type handling
                        const reactions = msg.reactions || {};
                        
                        // Ensure reactions is a valid object with at least one entry
                        const hasReactions = reactions && 
                          typeof reactions === 'object' && 
                          Object.keys(reactions).length > 0;
                        
                        if (!hasReactions) return null;
                        
                        return (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(reactions).map(([emoji, usernames]) => {
                              // Skip rendering if the usernames array is empty or undefined
                              if (!Array.isArray(usernames) || usernames.length === 0) return null;
                              
                              // Check if current user has reacted with this emoji
                              const hasUserReacted = Array.isArray(usernames) && 
                                usernames.includes(currentUsername);
                              
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => handleMessageReaction(msg.messageId || msg.id?.toString(), emoji)}
                                  className={cn(
                                    "inline-flex items-center text-xs rounded-full px-2 py-0.5",
                                    "border transition-colors hover:bg-accent shadow-sm",
                                    hasUserReacted ? "bg-primary/15 border-primary/30" : "bg-muted border-border"
                                  )}
                                  title={`${usernames.join(', ')}`}
                                >
                                  <span className="mr-1 text-sm">{emoji}</span>
                                  <span className="font-medium">{usernames.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                      
                      {/* Message footer with timestamp and reaction button */}
                      <div className="flex justify-between items-center gap-1.5 mt-1.5">
                        {/* Timestamp */}
                        <span className="text-[15px] opacity-70">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        
                        {/* Status indicators and reaction button */}
                        <div className="flex items-center gap-2">
                          {/* Message status indicators for sent messages */}
                          {msg.userId === currentUserId && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {msg.status === 'sending' && (
                                    <Clock className="h-3 w-3 text-primary-foreground/70" />
                                  )}
                                  {msg.status === 'sent' && (
                                    <CheckCircle2 className="h-3 w-3 text-primary-foreground/70" />
                                  )}
                                  {msg.status === 'error' && (
                                    <AlertCircle className="h-3 w-3 text-destructive" />
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {msg.status === 'sending' ? 'Sending...' : 
                                  msg.status === 'sent' ? 'Sent' : 'Failed to send'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {/* Reaction button - always visible for all messages */}
                          {!readOnly && <Popover>
                            <PopoverTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0 rounded-full opacity-70 hover:opacity-100 hover:bg-primary/10"
                              >
                                <SmilePlus className="h-3.5 w-3.5" />
                                <span className="sr-only">Add reaction</span>
                              </Button>
                            </PopoverTrigger>
                              <PopoverContent className="w-auto p-2" side="top" align={msg.userId === currentUserId ? "end" : "start"}>
                                <div className="flex flex-wrap gap-1 max-w-[240px]">
                                  {quickEmojis.map(emoji => (
                                    <Button
                                      key={emoji}
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 rounded-full"
                                      onClick={() => {
                                        handleMessageReaction(msg.messageId || msg.id?.toString(), emoji);
                                        // Close the popover after selecting an emoji using proper close method
                                        const closeEvent = new Event('keydown');
                                        Object.defineProperty(closeEvent, 'key', {value: 'Escape'});
                                        document.dispatchEvent(closeEvent);
                                      }}
                                    >
                                      <span className="text-lg">{emoji}</span>
                                    </Button>
                                  ))}
                                </div>
                              </PopoverContent>
                          </Popover>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Message input box fixed at the bottom - fixed position with visible background */}
        {!readOnly && <div className={cn(
          "p-3 border-t bg-background fixed shadow-lg z-50 w-full max-w-[100vw]",
          isMobileChat
            ? "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
            : "bottom-0 pb-3",
          // Additional styling to ensure visibility
          "left-0 right-0 mx-auto"
        )}
        style={{
          // Ensure it stays within the boundaries of the chat container
          maxWidth: scrollAreaRef.current?.clientWidth || '100%'
        }}>
          <div className="space-y-2">
            <form onSubmit={handleSend} className="flex w-full gap-2 items-center">
              <div className="flex-1 flex items-center gap-1 relative">
                <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                    >
                      <Smile className="h-5 w-5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 shadow-lg" side="top" align="start">
                    <EmojiPicker
                      onEmojiClick={(emojiData: EmojiClickData) => {
                        setMessage(prev => prev + emojiData.emoji);
                        setEmojiPickerOpen(false);
                      }}
                      searchDisabled={true}
                      width="100%"
                      height={350}
                      theme={Theme.AUTO}
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Type a message..."
                  className="flex-1 h-10"
                  disabled={isSending}
                />
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      type="submit" 
                      size="icon"
                      disabled={isSending || !message.trim()}
                      className={cn(
                        "transition-colors h-10 w-10 flex-shrink-0",
                        message.trim() ? "bg-primary" : "bg-muted"
                      )}
                    >
                      {isSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Send message
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </form>
            
            <div className="flex items-center gap-1.5 py-1 px-2 border rounded-lg bg-muted/30 overflow-x-auto hide-scrollbar">
              <span className="text-[15px] font-medium text-muted-foreground mr-1 whitespace-nowrap flex-shrink-0">Quick:</span>
              {quickEmojis.map(emoji => (
                <Button
                  key={emoji}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-full flex-shrink-0 hover:bg-accent"
                  disabled={isSending}
                  onClick={() => handleQuickEmoji(emoji)}
                >
                  <span className="text-base">{emoji}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>}
      </div>

      {/* UserProfileModal for profile picture clicks */}
      <UserProfileModal 
        userId={selectedUserId}
        open={showUserProfile}
        onOpenChange={setShowUserProfile}
      />
    </>
  );
}