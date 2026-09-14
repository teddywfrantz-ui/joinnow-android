import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import {
  Clock, MapPin, Users, Code, School, Dumbbell, Palette, Gamepad,
  Music, Utensils, LayoutGrid, Check, X, ArrowLeft, Crown,
  UserMinus, CheckCircle2, AlertTriangle, Timer, Loader2, Hourglass, ChevronRight,
  MessageSquare, Filter as FilterIcon, CalendarClock, Award, PartyPopper
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Meetup } from "@db/schema";
import { Link, useLocation } from "wouter";
import { useJoinRequests } from "@/hooks/use-join-requests";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import { ProfilePictureModal } from "@/components/users/profile-picture-modal";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { Textarea } from "@/components/ui/textarea";
import { UserTraitsDialog } from "@/components/users/user-traits-dialog";
import { UserProfileModal } from "@/components/users/user-profile-modal";
import { Badge } from "@/components/ui/badge";
import type { CurrentGroup, GroupMeetupRequest } from "@/hooks/use-groups";
import { RequestingGroupProfiles } from "@/components/groups/requesting-group-profiles";
import { GroupMembersDialog } from "@/components/groups/group-members-dialog";

interface UserTraits {
  traitName: string;
  traitCategory: string;
  endorsements: number;
  totalVotes?: number;
}

// Import fully typed WebSocketMessage interface from use-websocket.ts
import { 
  WebSocketMessage, 
  ChatMessage, 
  RequestMessage, 
  ParticipantMessage, 
  LocationMessage, 
  JoinMessage, 
  TypingMessage,
  ReactionMessage
} from "@/hooks/use-websocket";

function ParticipantCard({ participant, isCreator, currentUser, onRemove, onClick }: {
  participant: { id: number; username: string; displayName?: string; createdAt: string; profilePicture?: string | null };
  isCreator: boolean;
  currentUser?: { id: number; username: string } | null;
  onRemove?: (id: number) => void;
  onClick?: () => void;
}) {
  const { data: traits } = useQuery({
    queryKey: ['/api/users', participant.id, 'traits'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${participant.id}/traits`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  // Fetch profile data if profilePicture is not provided
  const { data: profileData } = useQuery({
    queryKey: ['/api/users', participant.id, 'profile-picture'],
    queryFn: async () => {
      if (participant.profilePicture !== undefined) return null;
      const res = await fetch(`/api/users/${participant.id}/profile`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: participant.profilePicture === undefined
  });

  const profilePicture = participant.profilePicture !== undefined 
    ? participant.profilePicture 
    : (profileData?.profilePicture || null);

  const topTraits = traits?.slice(0, 3) || [];
  const hasMoreTraits = traits && traits.length > 3;

  // Debug log for profile pictures
  console.log(`Participant ${participant.username} profile picture in MeetupCard:`, { 
    fromParticipant: participant.profilePicture,
    fromProfileData: profileData?.profilePicture,
    finalValue: profilePicture
  });

  return (
    <div
      className="flex items-center gap-3 p-4 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <ProfilePictureModal
          profilePictureUrl={profilePicture}
          username={participant.username}
          displayName={participant.displayName}
          userId={participant.id}
          size="sm"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">
          {participant.displayName || participant.username}
          {participant.id === currentUser?.id && " (You)"}
        </div>
        <div className="text-xs text-muted-foreground">
          @{participant.username}
        </div>
        {topTraits.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {topTraits.map((trait: UserTraits) => (
              <Badge
                key={trait.traitName}
                variant="secondary"
                className="text-xs flex items-center gap-1"
              >
                {trait.traitName}
                <span className="text-muted-foreground">·</span>
                <span>{trait.endorsements}</span> {/* Using existing prop but displaying as ratings */}
                {trait.totalVotes && trait.totalVotes !== trait.endorsements && (
                  <span className="text-muted-foreground text-xs ml-1">({trait.totalVotes} ratings)</span>
                )}
              </Badge>
            ))}
            {hasMoreTraits && (
              <Badge
                variant="secondary"
                className="text-xs bg-muted/50"
              >
                +{traits.length - 3} more
              </Badge>
            )}
          </div>
        )}
        <div className="text-sm text-muted-foreground mt-1">
          Joined {participant.createdAt && formatDistanceToNow(new Date(participant.createdAt), { addSuffix: true })}
        </div>
      </div>
      {isCreator && participant.id !== currentUser?.id && onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive-foreground hover:bg-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(participant.id);
          }}
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function MeetupCard({
  meetup: initialMeetup,
  currentUser,
  onAfterJoin,
  defaultTab = 'details',
  showPendingRequests = false,
  activeMeetupId
}: MeetupCardProps) {
  const [showParticipants, setShowParticipants] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'requests'>(defaultTab);
  const [showConfirmDialog, setShowConfirmDialog] = useState<'complete' | 'leave' | null>(null);
  const [showDurationDialog, setShowDurationDialog] = useState(false);
  const [isUpdatingDuration, setIsUpdatingDuration] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, expiryDate: null as Date | null });
  const [isLoading, setIsLoading] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string } | null>(null);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [selectedGroupRequest, setSelectedGroupRequest] = useState<{
    meetupId: number;
    requestId: number;
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const { data: currentGroups = [] } = useQuery<CurrentGroup[]>({
    queryKey: ["/api/groups"],
    queryFn: async () => {
      const response = await fetch("/api/groups", { credentials: "include" });
      if (response.status === 401) return [];
      if (!response.ok) throw new Error("Failed to load current group");
      return response.json();
    },
    enabled: Boolean(currentUser),
    staleTime: 0,
    refetchOnMount: true,
  });
  const currentGroup = currentGroups[0] ?? null;
  const groupRequest = currentGroup?.pendingMeetupRequests.find(
    (request) => request.meetupId === initialMeetup.id,
  );
  const { data: groupRequests = [] } = useQuery<
    GroupMeetupRequest[]
  >({
    queryKey: [`/api/meetups/${initialMeetup.id}/group-requests`],
    queryFn: async () => {
      const response = await fetch(
        `/api/meetups/${initialMeetup.id}/group-requests`,
        { credentials: "include" },
      );
      if (response.status === 401 || response.status === 403) return [];
      if (!response.ok) throw new Error("Failed to load group requests");
      return response.json();
    },
    enabled: Boolean(currentUser) && currentUser?.id === initialMeetup.creator_id,
    staleTime: 0,
    refetchInterval: 5000,
  });

  // Don't show the card on active meet page
  if (location === '/active-meet') {
    return null;
  }


  // Fetch live meetup data
  const { data: meetup = initialMeetup, isLoading: isMeetupLoading } = useQuery({
    queryKey: [`/api/meetups/${initialMeetup.id}`],
    queryFn: async () => {
      const response = await fetch(`/api/meetups/${initialMeetup.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch Meet');
      return response.json();
    },
    initialData: initialMeetup,
    refetchInterval: 5000,
  });

  const { sendRequest, cancelRequest, pendingRequest, requests, handleRequest, leaveMeetup, isRequestLoading } = useJoinRequests(meetup.id);
  // Cards are visible before participation. Keep this connection user-scoped;
  // participant chat rooms are joined only by the active meetup/chat views.
  const { subscribe, sendMessage } = useWebSocket();
  const isCreator = currentUser?.id === meetup.creator_id;

  // Function to calculate time left
  const calculateTimeLeft = () => {
    const expiresIn = new Date(meetup.expiresAt).getTime() - Date.now();
    const hours = Math.max(0, Math.floor(expiresIn / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60)));
    setTimeLeft({ 
      hours, 
      minutes,
      expiryDate: new Date(meetup.expiresAt) 
    });
  };

  useEffect(() => {
    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 60000);
    return () => clearInterval(interval);
  }, [meetup.expiresAt]);

  useEffect(() => {
    if (showPendingRequests) {
      setViewMode('requests');
    }
  }, [showPendingRequests]);

  // Define specific types for the message handlers
  type MeetupCardMessageHandlers = {
    join_request: (message: RequestMessage) => void;
    request_accepted: (message: RequestMessage) => void;
    request_rejected: (message: RequestMessage) => void;
    request_canceled: (message: RequestMessage) => void;
    meetup_disbanded: (message: ParticipantMessage) => void;
    meetup_completed: (message: ParticipantMessage) => void;
    participant_left: (message: ParticipantMessage) => void;
    chat: (message: ChatMessage) => void;
    location_update: (message: LocationMessage) => void;
    join: (message: JoinMessage) => void;
    friend_request: (message: RequestMessage) => void;
    friend_request_update: (message: RequestMessage) => void;
    request_update: (message: RequestMessage) => void;
    typing: (message: TypingMessage) => void;
    stop_typing: (message: TypingMessage) => void;
    reaction: (message: ReactionMessage) => void;
  };

  useEffect(() => {
    if (!subscribe) return;

    console.log('Setting up WebSocket subscription for meetup:', meetup.id);

    const messageHandlers: MeetupCardMessageHandlers = {
      join_request: (message) => {
        console.log('Received join request message:', message);
        if (isCreator) {
          // Update all affected queries when a join request is received
          Promise.all([
            queryClient.invalidateQueries({ queryKey: [`/api/meetups/${initialMeetup.id}/requests`] }),
            queryClient.invalidateQueries({ queryKey: [`/api/meetups/${initialMeetup.id}`] }),
            queryClient.invalidateQueries({ queryKey: ['/api/meetups'] })
          ]).then(() => {
            console.log('Successfully invalidated queries after join request');
          }).catch(error => {
            console.error('Failed to invalidate queries after join request:', error);
          });
          
          toast({
            title: "New Join Request",
            description: `${message.username || 'Someone'} wants to join your Meet`,
          });
        }
      },
      request_accepted: (message) => {
        console.log('Received request accepted message:', message);
        // Invalidate queries regardless of who received the message to keep UI in sync
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/active-meetup'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/pending-requests'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/my-pending-requests'] })
        ]).then(() => {
          console.log('Successfully invalidated queries after request acceptance');
        }).catch(error => {
          console.error('Failed to invalidate queries after request acceptance:', error);
        });
        
        if (message.userId === currentUser?.id) {
          toast({
            title: "Request Accepted",
            description: `Your request to join ${message.title || 'the Meet'} has been accepted!`,
            variant: "default" // Changed from "success" to "default" to match allowed values
          });
        }
      },
      request_rejected: (message) => {
        console.log('Received request rejected message:', message);
        
        // Update queries regardless of who received the message to keep UI in sync
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/pending-requests'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/my-pending-requests'] }),
          queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/requests`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/my-request`] })
        ]).then(() => {
          console.log('Successfully invalidated queries after request rejection');
        }).catch(error => {
          console.error('Failed to invalidate queries after request rejection:', error);
        });
        
        if (message.userId === currentUser?.id) {
          toast({
            title: "Request Rejected",
            description: message.message || "Your join request was rejected",
            variant: "destructive"
          });
        }
      },
      request_canceled: (message) => {
        console.log('Received request_canceled message:', message);
        
        // Immediately update UI when a request is canceled with comprehensive query invalidation
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/pending-requests'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/my-pending-requests'] }),
          queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/requests`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/my-request`] })
        ]).then(() => {
          console.log('Successfully invalidated queries after request cancellation');
          
          // If this user canceled their own request, show a confirmation
          if (message.userId === currentUser?.id) {
            toast({
              title: "Request Canceled",
              description: "Your join request has been canceled",
            });
          }
        }).catch(error => {
          console.error('Failed to invalidate queries after request cancellation:', error);
        });
      },
      meetup_disbanded: (message) => {
        toast({
          title: "Meet Disbanded",
          description: message.message || "This Meet has been disbanded by the creator",
          variant: "destructive"
        });
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] });
        queryClient.invalidateQueries({ queryKey: ['/api/active-meetup'] });
      },
      meetup_completed: (message) => {
        toast({
          title: "Meet Completed",
          description: message.message || "This Meet has been marked as completed",
        });
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] });
        queryClient.invalidateQueries({ queryKey: ['/api/active-meetup'] });
      },
      participant_left: (message) => {
        if (isCreator) {
          toast({
            title: "Participant Left",
            description: message.message || "A participant has left the Meet",
          });
          queryClient.invalidateQueries({ queryKey: [`/api/meetups/${initialMeetup.id}/participants`] });
        }
      },
      chat: () => {},
      location_update: () => {},
      join: () => {},
      friend_request: () => {},
      friend_request_update: () => {},
      request_update: () => {},
      typing: () => {},
      stop_typing: () => {},
      reaction: () => {} // Add handler for reaction messages
    };

    const unsubscribe = subscribe((message) => {
      console.log('Received WebSocket message in MeetupCard:', message);
      const handler = messageHandlers[message.type as keyof MeetupCardMessageHandlers];
      if (handler) {
        // Call the appropriate handler based on the message type
        if (message.type === 'join_request' || 
            message.type === 'request_accepted' || 
            message.type === 'request_rejected' || 
            message.type === 'request_canceled' || 
            message.type === 'request_update' || 
            message.type === 'friend_request' || 
            message.type === 'friend_request_update') {
          (handler as (message: RequestMessage) => void)(message as RequestMessage);
        } 
        else if (message.type === 'meetup_disbanded' || 
                 message.type === 'meetup_completed' || 
                 message.type === 'participant_left') {
          (handler as (message: ParticipantMessage) => void)(message as ParticipantMessage);
        }
        else if (message.type === 'chat') {
          (handler as (message: ChatMessage) => void)(message as ChatMessage);
        }
        else if (message.type === 'location_update') {
          (handler as (message: LocationMessage) => void)(message as LocationMessage);
        }
        else if (message.type === 'join') {
          (handler as (message: JoinMessage) => void)(message as JoinMessage);
        }
        else if (message.type === 'typing' || message.type === 'stop_typing') {
          (handler as (message: TypingMessage) => void)(message as TypingMessage);
        }
        else if (message.type === 'reaction') {
          (handler as (message: ReactionMessage) => void)(message as ReactionMessage);
        }
      }
    });

    return () => {
      console.log('Cleaning up WebSocket subscription');
      unsubscribe();
    };
  }, [initialMeetup.id, subscribe, isCreator, currentUser?.id, queryClient, toast]);

  const handleExtendDuration = async (hours: number) => {
    try {
      setIsUpdatingDuration(true);
      const newExpiryDate = new Date(meetup.expiresAt);
      newExpiryDate.setHours(newExpiryDate.getHours() + hours);

      const response = await fetch(`/api/meetups/${meetup.id}/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newExpiresAt: newExpiryDate.toISOString() }),
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      // Force immediate refetch of all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/participants`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/requests`] })
      ]);

      // Force immediate recalculation of time left
      calculateTimeLeft();

      toast({
        title: "Duration Extended",
            description: `Meet duration has been extended by ${hours} hour${hours > 1 ? 's' : ''}.`
      });

      setShowDurationDialog(false);
    } catch (error) {
      toast({
        title: "Failed to extend duration",
          description: error instanceof Error ? error.message : "Failed to extend Meet duration",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingDuration(false);
    }
  };

  const ThemeIcon = getThemeIcon(meetup.theme);
  const participantCount = meetup.participantCount || 0;
  const isMeetupFull = participantCount >= meetup.maxParticipants;

  // Change the participants fetching query to not require authentication
  const { data: participants } = useQuery({
    queryKey: [`/api/meetups/${meetup.id}/participants`],
    queryFn: async () => {
      const response = await fetch(`/api/meetups/${meetup.id}/participants`, {
        credentials: 'include'
      });
      if (!response.ok) {
        if (response.status === 401) {
          // Return empty array for unauthorized users instead of throwing
          return [];
        }
        throw new Error('Failed to fetch participants');
      }
      return response.json();
    },
    enabled: showParticipants || isCreator
  });

  const filteredParticipants = participants?.filter((p: { id: number }) => p.id !== meetup.creator_id) || [];
  // Update the isParticipant check to properly detect when user is already in the meetup
  const isParticipant = currentUser && (
    participants?.some((p: { id: number }) => p.id === currentUser.id) ||
    meetup.creator_id === currentUser.id
  );
  const hasCurrentUserPendingRequest = pendingRequest?.user_id === currentUser?.id && pendingRequest?.status === 'pending';
  const canSeeLocation = isCreator || isParticipant;
  const capacityClass = getCapacityClass(participantCount, meetup.maxParticipants);

  const handleGroupRequest = async () => {
    if (!currentUser || !currentGroup) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/groups/${currentGroup.id}/meetup-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ meetupId: meetup.id }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to request for group");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/groups"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/meetups"] }),
      ]);
      toast({
        title: "Group request sent",
        description: `Your request was sent for all ${currentGroup.members.length} group members.`,
      });
    } catch (error) {
      toast({
        title: "Cannot request for group",
        description: error instanceof Error ? error.message : "Failed to request for group",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelGroupRequest = async () => {
    if (!currentUser || !currentGroup || !groupRequest) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/groups/${currentGroup.id}/meetup-requests/${groupRequest.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to cancel group request");
      await queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Group request cancelled" });
    } catch (error) {
      toast({
        title: "Failed to cancel group request",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGroupDecision = async (
    request: GroupMeetupRequest,
    status: "accepted" | "rejected",
  ) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/meetups/${meetup.id}/group-requests/${request.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Failed to ${status} group request`);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [`/api/meetups/${meetup.id}/group-requests`],
        }),
        queryClient.invalidateQueries({
          queryKey: [`/api/meetups/${meetup.id}`],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/meetups"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/groups"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/active-meetup"] }),
      ]);
      toast({
        title: status === "accepted" ? "Group accepted" : "Group request declined",
        description:
          status === "accepted"
            ? `${request.groupName || "The group"} joined your meetup.`
            : "The group request was declined.",
      });
    } catch (error) {
      toast({
        title: `Failed to ${status} group request`,
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  const handleJoinRequest = async (meetupId: number) => {
    if (!currentUser) return;
    if (currentGroup && !currentGroup.currentMeetupId && !isCreator) {
      await handleGroupRequest();
      return;
    }
    setIsLoading(true);

    try {
      await sendRequest(meetupId, joinMessage);

      // Thoroughly update all related queries to ensure proper state synchronization
      // This is critical for map-list view switching to work correctly
      console.log('Join request sent successfully, invalidating all related queries');
      await Promise.all([
        // Invalidate the specific meetup
        queryClient.invalidateQueries({
          queryKey: [`/api/meetups/${meetupId}`]
        }),
        // Invalidate all meetups to update the UI
        queryClient.invalidateQueries({
          queryKey: ['/api/meetups']
        }),
        // Invalidate pending requests to show proper status
        queryClient.invalidateQueries({
          queryKey: ['/api/pending-requests']
        }),
        // Invalidate my pending requests
        queryClient.invalidateQueries({
          queryKey: ['/api/my-pending-requests']
        })
      ]);

      // Manually update the local state to avoid UI flicker
      // This gives immediate feedback before the query refetch completes
      if (currentUser?.id) {
        const optimisticPendingRequest = {
          meetupId: meetupId,
          user_id: currentUser.id,
          status: 'pending',
          message: joinMessage || ''
        };
        
        // Update any active WebSocket connection
        if (sendMessage) {
          sendMessage({
            type: 'join_request',
            meetupId: meetupId,
            userId: currentUser.id,
            username: currentUser.username,
            message: joinMessage
          });
        }
      }

      if (onAfterJoin) {
        onAfterJoin();
      }

      toast({
        title: "Request Sent",
        description: "Your request to join this Meet has been sent.",
      });
    } catch (error) {
      console.error('Join request error:', error);
      toast({
        title: "Cannot Join Meet",
        description: error instanceof Error ? error.message : "Failed to send join request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setJoinMessage(''); // Clear the message field
    }
  };

  const handleCreatorAction = async (action: 'complete') => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/meetups/${meetup.id}/${action}`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${action} Meet`);
      }

      // Close all dialogs first
      setShowConfirmDialog(null);
      setShowParticipants(false);
      setViewMode('details');
      setShowDurationDialog(false);

      toast({
      title: `Meet Ended`,
      description: `The Meet has been successfully ended. Preparing rating page...`,
        duration: 3000,
      });

      // Force immediate refetch of all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/participants`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/requests`] }),
        queryClient.invalidateQueries({ queryKey: ['/api/active-meetup'] })
      ]);

      // Small timeout to ensure state updates and query invalidation complete
      setTimeout(() => {
        onAfterJoin?.(); // Close any parent dialogs
        setLocation(`/rate/${meetup.id}`);
      }, 1000);

    } catch (error) {
      toast({
      title: `Failed to end Meet`,
      description: error instanceof Error ? error.message : `An error occurred while trying to end the Meet`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToChat = () => {
    // Close all dialogs first
    setShowParticipants(false);
    setViewMode('details');
    setShowConfirmDialog(null);
    setShowDurationDialog(false);
    if (onAfterJoin) {
      onAfterJoin();
    }

    // Use a small timeout to ensure state updates complete before navigation
    setTimeout(() => {
      setLocation('/active-meet?tab=chat');
    }, 0);
  };

  const handleRemoveMember = async (memberId: number) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/meetups/${meetup.id}/members/${memberId}/remove`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove member');
      }

      // Force immediate refetch
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/participants`] }),
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] })
      ]);

      toast({
        title: 'Member Removed',
        description: 'Member successfully removed from Meet.',
      });

      setShowParticipants(false); // Close the participants dialog after successful removal
    } catch (error) {
      toast({
        title: 'Failed to remove member',
        description: error instanceof Error ? error.message : 'Failed to remove member from Meet',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Move this check earlier in the component to prevent showing join UI for participants

  if (isCreator && viewMode === 'requests' && requests) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Join Requests</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('details')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            {!requests || requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pending requests
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground px-1">Pending Requests</h4>
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      setSelectedUser({ 
                        id: request.user_id, 
                        username: request.username || 'Unknown User'
                      });
                      setViewMode('details'); // Close the requests view when viewing traits
                    }}
                  >
                    <ProfileAvatar
                      profilePicture={request.profilePicture}
                      username={request.username || 'Unknown User'}
                      displayName={request.displayName}
                      size="sm"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        {request.displayName || request.username}
                        {request.displayName && request.username && (
                          <span className="text-muted-foreground text-sm ml-1">@{request.username}</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div className="mt-1 text-sm text-foreground/80">
                          {request.message || "No message provided"}
                        </div>
                        <UseTraitsBadges userId={request.user_id} />
                        <p className="mt-1">
                          Requested {request.createdAt && formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRequest({ requestId: request.id, meetupId: meetup.id, status: 'rejected' });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="relative"
                      >
                        <Button
                          size="sm"
                          className="gap-1 text-green-600"
                          onClick={(e) => {
                            e.stopPropagation();

                            // Create celebration animation
                            const button = e.currentTarget;
                            const rect = button.getBoundingClientRect();
                            const centerX = rect.left + rect.width / 2;
                            const centerY = rect.top + rect.height / 2;

                            // Create confetti elements
                            for (let i = 0; i < 20; i++) {
                              const confetti = document.createElement('div');
                              confetti.className = 'fixed rounded-full z-50';
                              confetti.style.width = `${4 + Math.random() * 4}px`;
                              confetti.style.height = confetti.style.width;
                              confetti.style.backgroundColor = [
                                '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'
                              ][Math.floor(Math.random() * 4)];
                              confetti.style.position = 'fixed';
                              confetti.style.left = `${centerX}px`;
                              confetti.style.top = `${centerY}px`;
                              document.body.appendChild(confetti);

                              // Animate the confetti
                              const angle = Math.random() * Math.PI * 2;
                              const distance = 40 + Math.random() * 80;
                              const duration = 500 + Math.random() * 1000;

                              confetti.animate([
                                { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
                                { 
                                  transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(${Math.random() * 0.5 + 1})`,
                                  opacity: 0
                                }
                              ], {
                                duration,
                                easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
                              }).onfinish = () => {
                                document.body.removeChild(confetti);
                              };
                            }

                            // Show a celebration icon that grows and fades
                            const celebration = document.createElement('div');
                            celebration.className = 'fixed z-50 text-green-500 pointer-events-none';
                            celebration.style.left = `${centerX}px`;
                            celebration.style.top = `${centerY}px`;
                            celebration.style.transform = 'translate(-50%, -50%)';
                            celebration.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm0 16.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1-5.5a1 1 0 0 1-2 0V9a1 1 0 1 1 2 0v4z"/></svg>';
                            document.body.appendChild(celebration);

                            celebration.animate([
                              { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
                              { transform: 'translate(-50%, -50%) scale(2.5)', opacity: 0 }
                            ], {
                              duration: 800,
                              easing: 'ease-out'
                            }).onfinish = () => {
                              document.body.removeChild(celebration);
                            };

                            handleRequest({ requestId: request.id, meetupId: meetup.id, status: 'accepted' });
                          }}
                        >
                          <Check className="h-4 w-4" />
                          <span>Accept</span>
                          
                          <motion.div 
                            className="absolute inset-0 bg-green-500/20 rounded-md"
                            initial={{ scale: 0, opacity: 0 }}
                            whileTap={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                          />
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {groupRequests.length > 0 && (
              <div className="mt-6 space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground px-1">
                  Pending group requests
                </h4>
                {groupRequests.map((request) => (
                  <div
                    key={`group-${request.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 p-4"
                  >
                    <div>
                      <p className="font-medium">
                        {request.groupName || "Another group"}
                      </p>
                      <p className="text-sm text-muted-foreground">
              Requested for this Meet
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelectedGroupRequest({
                            meetupId: meetup.id,
                            requestId: request.id,
                          })
                        }
                      >
                        <Users className="mr-1 h-4 w-4" /> View group
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGroupDecision(request, "rejected")}
                        disabled={isLoading}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleGroupDecision(request, "accepted")}
                        disabled={isLoading}
                      >
                        Accept group
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn({
        'border-primary': activeMeetupId === meetup.id,
        'bg-accent/5': activeMeetupId === meetup.id
      })}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              {meetup.title}
              {activeMeetupId === meetup.id && (
                <Badge variant="default" className="text-xs">
                  Active Meet
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ThemeIcon className="h-4 w-4" />
              <span className="text-sm capitalize">{meetup.theme}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {timeLeft.expiryDate ? (
                `Expires: ${new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true
                }).format(timeLeft.expiryDate)}`
              ) : (
                `${timeLeft.hours}h ${timeLeft.minutes}m left`
              )}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">{meetup.description}</p>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {canSeeLocation ? meetup.exactLocation : 'Precise location hidden until accepted'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              className="group p-0 h-auto hover:bg-transparent flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setShowParticipants(true)}
            >
              <Users className={cn("h-4 w-4", capacityClass)} />
              <span className="text-sm flex items-center gap-1">
                {participantCount}/{meetup.maxParticipants} participants
                <ChevronRight className="h-3 w-3 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
              </span>
            </Button>
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            Created by:{" "}
            {meetup.group_id ? (
              <button
                type="button"
                className="font-medium text-foreground hover:underline"
                onClick={() => setShowGroupMembers(true)}
              >
                {meetup.creator_group_name || meetup.creator_displayName || meetup.creator_username || "Group"}
              </button>
            ) : (
              <Button
                variant="link"
                className="h-auto p-0 text-sm text-muted-foreground hover:text-primary"
                onClick={() => {
                  if (meetup.creator_id && meetup.creator_username) {
                    setSelectedUser({
                      id: meetup.creator_id,
                      username: meetup.creator_username
                    });
                  }
                }}
              >
                {meetup.creator_displayName || meetup.creator_username || 'Unknown'}
              </Button>
            )}
          </div>
          
          {/* Show demographic filters for creators only */}
          {isCreator && (meetup.genderFilter || meetup.minAgeFilter || meetup.maxAgeFilter) && (
            <div className="mt-3 text-sm border-t pt-3">
              <h4 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                <FilterIcon className="h-4 w-4" />
                Demographic Filters
              </h4>
              <div className="flex flex-wrap gap-2">
                {meetup.genderFilter && (
                  <Badge variant="outline" className="rounded-md flex items-center gap-2 py-1 px-2 bg-muted/50 border-muted-foreground/20">
                    <Users className="h-3.5 w-3.5 text-primary/70" />
                    <span className="text-sm">Gender: <span className="font-medium">{meetup.genderFilter}</span></span>
                  </Badge>
                )}
                {(meetup.minAgeFilter || meetup.maxAgeFilter) && (
                  <Badge variant="outline" className="rounded-md flex items-center gap-2 py-1 px-2 bg-muted/50 border-muted-foreground/20">
                    <CalendarClock className="h-3.5 w-3.5 text-primary/70" />
                    <span className="text-sm">Age: {meetup.minAgeFilter ? `${meetup.minAgeFilter}+` : ''}
                    {meetup.minAgeFilter && meetup.maxAgeFilter ? ' to ' : ''}
                    {meetup.maxAgeFilter ? `${meetup.maxAgeFilter} or under` : ''}</span>
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          {currentUser ? (
            isParticipant ? (
              <div className="w-full space-y-2">
                {isCreator ? (
                  <>
                    <div className="flex gap-2 mb-2">
                      {requests && requests.length > 0 ? (
                        <Button
                          className="flex-1 gap-2"
                          onClick={() => setViewMode('requests')}
                          disabled={isLoading}
                        >
                          <Hourglass className="h-4 w-4 text-blue-500 animate-pulse" />
                          View Requests ({requests.length})
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          variant="outline"
                          onClick={() => setViewMode('requests')}
                          disabled={isLoading}
                        >
                          Show Requests
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => setShowDurationDialog(true)}
                        disabled={isUpdatingDuration}
                      >
                        {isUpdatingDuration ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />}
                        Extend Duration
                      </Button>
                      <Button
                        variant="default"
                        className="flex-1 gap-2"
                        onClick={handleGoToChat}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Go to Chat
                      </Button>
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full gap-2"
                      onClick={() => setShowConfirmDialog('complete')}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      End Meet
                    </Button>
                  </>
                ) : (
                  <div className="w-full space-y-2">
                    <Button
                      variant="default"
                      className="w-full gap-2"
                      onClick={handleGoToChat}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Go to Chat
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full gap-2"
                      onClick={() => setShowConfirmDialog('leave')}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserMinus className="h-4 w-4" />
                      )}
                      Leave Meet
                    </Button>
                  </div>
                )}
              </div>
            ) : currentGroup?.currentMeetupId ? (
              <Button className="w-full" variant="outline" disabled>
              Your group is in an active Meet
              </Button>
            ) : groupRequest ? (
              <div className="w-full flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  variant="outline"
                  disabled={true}
                >
                  <Hourglass className="h-4 w-4 text-blue-500 animate-pulse" />
                  Group request pending
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Cancel group request"
                  className="text-destructive hover:text-destructive-foreground hover:bg-destructive"
                  onClick={handleCancelGroupRequest}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : hasCurrentUserPendingRequest ? (
              <div className="w-full flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  variant="outline"
                  disabled={true}
                >
                  <Hourglass className="h-4 w-4 text-blue-500 animate-pulse" />
                  Request Pending
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive-foreground hover:bg-destructive"
                  onClick={() => pendingRequest && cancelRequest(pendingRequest.id)}
                  disabled={isRequestLoading}
                >
                  {isRequestLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : isMeetupFull ? (
              <Button
                className="w-full"
                variant="outline"
                disabled
              >
              Meet Full!
              </Button>
            ) : (
              <div className="w-full space-y-2">
                {(!currentGroup || currentGroup.currentMeetupId) && (
                  <Textarea
                    placeholder="I'd like to join your meet!"
                    className="min-h-[80px]"
                    value={joinMessage}
                    onChange={(e) => setJoinMessage(e.target.value)}
                  />
                )}
                <Button
                  className="w-full"
                  onClick={() => handleJoinRequest(meetup.id)}
                  variant="default"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    currentGroup && !currentGroup.currentMeetupId
                      ? 'Request for group'
                      : 'Request to join'
                  )}
                </Button>
              </div>
            )
          ) : (
            <Link href="/auth" className="w-full">
              <Button className="w-full" variant="outline">
                Sign in to request to join!
              </Button>
            </Link>
          )}
        </CardFooter>
      </Card>

      <Dialog open={showParticipants} onOpenChange={setShowParticipants}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Meet Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[300px] pr-4">
            {(!filteredParticipants || filteredParticipants.length === 0) && !meetup.creator_username ? (
              <div className="text-center py-8 text-muted-foreground">
                No participants yet
              </div>
            ) : (
              <div className="space-y-4">
                {meetup.creator_username && (
                  meetup.group_id ? (
                    <div className="rounded-lg border p-4">
                      <p className="font-medium">
                        Created by group:{" "}
                        {meetup.creator_group_name ||
                          meetup.creator_displayName ||
                          meetup.creator_username}
                      </p>
                    </div>
                  ) : (
                    <ParticipantCard
                      participant={{
                        id: meetup.creator_id || 0,
                        username: meetup.creator_username || 'Unknown',
                        createdAt: meetup.createdAt || new Date().toISOString(),
                        profilePicture: meetup.creator_profile_picture
                      }}
                      isCreator={false}
                      currentUser={currentUser}
                      onClick={() => {
                        const userData = {
                          id: meetup.creator_id || 0,
                          username: meetup.creator_username || 'Unknown'
                        };
                        setSelectedUser(userData);
                      }}
                    />
                  )
                )}
                {filteredParticipants?.map((participant: { 
                    id: number; 
                    username: string; 
                    displayName?: string; 
                    createdAt: string;
                    profilePicture?: string | null
                  }) => (
                  <ParticipantCard
                    key={participant.id}
                    participant={participant}
                    isCreator={isCreator}
                    currentUser={currentUser}
                    onRemove={handleRemoveMember}
                    onClick={() => {
                      const userData = { id: participant.id, username: participant.username };
                      setSelectedUser(userData);
                    }}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        title="Leave Meet"
        description="Are you sure you want to leave this meet? You can't rejoin unless the creator accepts a new request."
        open={showConfirmDialog === 'leave'}
        onOpenChange={(open) => setShowConfirmDialog(open ? 'leave' : null)}
        onConfirm={async () => {
          try {
            await leaveMeetup();
            setShowConfirmDialog(null);
            if (onAfterJoin) onAfterJoin(); // Close any parent dialogs/popups
          } catch (error) {
            console.error('Failed to leave meetup:', error);
          }
        }}
        confirmText="Leave"
        variant="destructive"
      />

      <Dialog open={!!showConfirmDialog && showConfirmDialog !== 'leave'} onOpenChange={(open) => setShowConfirmDialog(open ? null : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              End Meet
            </DialogTitle>
            <DialogDescription>
                Are you sure you want to end this Meet? This will mark the Meet as finished and allow participants to leave reviews.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (showConfirmDialog === 'complete') {
                  handleCreatorAction('complete');
                }
              }}
            >
              Confirm End Meet
            </Button>
          </DialogFooter>
        </DialogContent>      </Dialog>

      <Dialog open={showDurationDialog} onOpenChange={setShowDurationDialog}>
        <DialogContent>
          <DialogHeader>
          <DialogTitle>Extend Meet Duration</DialogTitle>
            <DialogDescription>
              Choose how many hours to extend the meetup. Total duration cannot exceed 24 hours from creation time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((hours) => (
              <Button
                key={hours}
                variant="outline"
                disabled={isUpdatingDuration}
                onClick={() => handleExtendDuration(hours)}
              >
                +{hours} Hour{hours > 1 ? 's' : ''}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDurationDialog(false)}
              disabled={isUpdatingDuration}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="relative z-50">
        <UserProfileModal
          userId={selectedUser?.id || null}
          open={!!selectedUser}
          onOpenChange={(open) => !open && setSelectedUser(null)}
        />
        <GroupMembersDialog
          groupId={meetup.group_id}
          groupName={
            meetup.creator_group_name ||
            meetup.creator_displayName ||
            meetup.creator_username ||
            "Group"
          }
          open={showGroupMembers}
          onOpenChange={setShowGroupMembers}
        />
      <RequestingGroupProfiles
        request={selectedGroupRequest}
        onClose={() => setSelectedGroupRequest(null)}
      />
      </div>
    </>
  );
}

function getThemeIcon(theme: string) {
  const iconMap: Record<string, typeof Code> = {
    technology: Code,
    social: Users,
    education: School,
    sports: Dumbbell,
    arts: Palette,
    gaming: Gamepad,
    music: Music,
    food: Utensils,
    other: LayoutGrid,
  };

  return iconMap[theme.toLowerCase()] || iconMap.other;
}

function getCapacityClass(count: number, max: number): string {
  const percentage = (count / max) * 100;
  if (percentage >= 100) return "stroke-red-500";
  if (percentage >= 75) return "stroke-orange-500";
  if (percentage >= 50) return "stroke-yellow-500";
  return "stroke-green-500";
}

interface MeetupCardProps {
  meetup: Meetup;
  currentUser?: { id: number; username: string } | null;
  onAfterJoin?: () => void;
  defaultTab?: 'details' | 'requests';
  showPendingRequests?: boolean;
  activeMeetupId?: number;
}

function UseTraitsBadges({ userId }: { userId: number }) {
  const { data: traits } = useQuery({
    queryKey: ['/api/users', userId, 'traits'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/traits`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  const topTraits = traits?.slice(0, 3) || [];
  const hasMoreTraits = traits && traits.length > 3;

  if (topTraits.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {topTraits.map((trait: UserTraits) => (
        <Badge
          key={trait.traitName}
          variant="secondary"
          className="text-xs flex items-center gap-1"
        >
          {trait.traitName}
          <span className="text-muted-foreground">·</span>
          <span>{trait.endorsements}</span>
        </Badge>
      ))}
      {hasMoreTraits && (
        <Badge
          variant="secondary"
          className="text-xs bg-muted/50"
        >
          +{traits.length - 3} more
        </Badge>
      )}
    </div>
  );
}