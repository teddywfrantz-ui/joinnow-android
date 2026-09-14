import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { JoinRequest } from '@db/schema';

// Extended interface for JoinRequest with displayName
interface ExtendedJoinRequest extends JoinRequest {
  displayName?: string;
}
import {
  Users,
  MessageSquare,
  MapPin,
  Loader2,
  Clock,
  Crown,
  Check,
  X,
  Calendar,
  Timer,
  Hash,
  Tag,
  UserMinus,
  ChevronDown,
  ChevronUp,
  Filter as FilterIcon,
  CalendarClock
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import { ProfilePictureModal } from "@/components/users/profile-picture-modal";
import type { Meetup } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { useMeetups } from "@/hooks/use-meetups";
import { ChatWindow } from "@/components/chat/chat-window";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useWebSocket } from "@/hooks/use-websocket";
import { useLocationSharing } from "@/hooks/use-location-sharing";
import { useJoinRequests } from "@/hooks/use-join-requests";
import { UserTraitsDialog } from "@/components/users/user-traits-dialog";
import { UserProfileModal } from "@/components/users/user-profile-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import type { GroupMeetupRequest } from "@/hooks/use-groups";
import { RequestingGroupProfiles } from "@/components/groups/requesting-group-profiles";
import { GroupMembersDialog } from "@/components/groups/group-members-dialog";

interface ParticipantLocation {
  userId: number | null;
  username: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

interface UserTraits {
  traitName: string;
  traitCategory: string;
  endorsements: number;
  totalVotes?: number;
}

interface ActiveMeetupPanelProps {
  meetup: Meetup;
  participants: Array<{
    id: number;
    username: string;
    displayName?: string;
    createdAt: string;
  }>;
  initialTab?: string | null;
}

function ParticipantCard({ participant, isCreator, currentUser, onRemove, onClick, showCreatorBadge = false }: {
  participant: { id: number; username: string; displayName?: string; createdAt: string; profilePicture?: string | null };
  isCreator: boolean;
  currentUser?: { id: number; username: string } | null;
  onRemove?: (id: number) => void;
  onClick?: () => void;
  showCreatorBadge?: boolean;
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

  // Log profile picture data to debug
  console.log(`Participant ${participant.username} profile picture:`, { 
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
          size="md"
          userId={participant.id}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium flex items-center gap-2">
          {participant.displayName || participant.username}
          {participant.id === currentUser?.id && " (You)"}
          {showCreatorBadge && <Crown className="h-4 w-4 text-primary" />}
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
          {showCreatorBadge ? (
            `Creator • Created ${participant.createdAt && new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              hour12: true
            }).format(new Date(participant.createdAt))}`
          ) : (
            `Joined ${participant.createdAt && new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              hour12: true
            }).format(new Date(participant.createdAt))}`
          )}
        </div>
      </div>
      {isCreator && participant.id !== currentUser?.id && onRemove && (
        <Button
          size="icon"
          variant="ghost"
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

export function ActiveMeetupPanel({ meetup, participants, initialTab }: ActiveMeetupPanelProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const { meetups } = useMeetups();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(initialTab || 'participants');
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket(meetup.id);
  const { locations, setLocations, error: locationError, isLoading: locationLoading } = useLocationSharing(
    meetup.id,
    user?.id || null,
    user?.username || null
  );
  // Get join requests and cast them to our extended interface
  const { requests: originalRequests, handleRequest } = useJoinRequests(meetup.id);
  const requests = originalRequests as ExtendedJoinRequest[] | undefined;
  const { data: groupRequests = [] } = useQuery<GroupMeetupRequest[]>({
    queryKey: [`/api/meetups/${meetup.id}/group-requests`],
    queryFn: async () => {
      const response = await fetch(
        `/api/meetups/${meetup.id}/group-requests`,
        { credentials: "include" },
      );
      if (response.status === 401 || response.status === 403) return [];
      if (!response.ok) throw new Error("Failed to load group requests");
      return response.json();
    },
    enabled: meetup.creator_id === user?.id,
    staleTime: 0,
    refetchInterval: 5000,
  });
  
  // Debug log to check if profilePicture is present in requests
  useEffect(() => {
    if (requests && requests.length > 0) {
      console.log("Pending join requests with profile pictures:", requests);
    }
  }, [requests]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [, setLocation] = useLocation();
  const [isCompleting, setIsCompleting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string } | null>(null);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [selectedGroupRequest, setSelectedGroupRequest] = useState<{
    meetupId: number;
    requestId: number;
  } | null>(null);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [maxExtensionHours, setMaxExtensionHours] = useState(0);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [startY, setStartY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastScrollPosition, setLastScrollPosition] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const participantsContainerRef = useRef<HTMLDivElement>(null);

  const handleGroupRequestDecision = async (
    request: GroupMeetupRequest,
    status: "accepted" | "rejected",
  ) => {
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
      if (!response.ok) throw new Error(payload?.error || "Unable to update group request");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [`/api/meetups/${meetup.id}/group-requests`],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/meetups"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/active-meetup"] }),
      ]);
      toast({
        title: status === "accepted" ? "Group accepted" : "Group declined",
        description:
          status === "accepted"
            ? `${request.groupName || "The group"} joined this Meet.`
            : "The group request was declined.",
      });
    } catch (error) {
      toast({
        title: "Group request update failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    calculateTimeLeft();
    const intervalId = setInterval(calculateTimeLeft, 60000);
    return () => clearInterval(intervalId);
  }, [meetup.expiresAt]);

  // Auto-collapse when changing to chat tab
  // But don't auto-collapse when switching to participants tab
  useEffect(() => {
    if (activeTab === 'chat') {
      setDetailsCollapsed(true);
    }
    // Participants tab should not auto-collapse when selected
    // This is intentionally not adjusting state for participants tab
  }, [activeTab]);

  // Add effect for chat scroll detection and handling show/hide events
  // Track scroll position for determining direction
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [manualToggleActive, setManualToggleActive] = useState(false);
  const manualToggleTimeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    let scrollStartPosition = 0;
    
    // Enhanced handler for the custom chat-scroll event with detailed information
    // Use Event type but cast it to access detail property
    const handleChatScroll = (e: Event) => {
      // Allow scroll handling for both chat and participants tabs
      // This ensures we collapse the header when scrolling in either tab on mobile
      if (activeTab !== 'chat' && activeTab !== 'participants') return;
      
      // Cast to CustomEvent to access detail property
      const customEvent = e as CustomEvent<{
        scrollTop: number;
        isNearTop: boolean;
        isNearBottom: boolean;
        scrollPercentage: number;
      }>;
      
      // Extract scroll details from the custom event
      const { 
        scrollTop, 
        isNearTop, 
        isNearBottom,
        scrollPercentage 
      } = customEvent.detail || {};
      
      // Ensure scrollTop exists before using it
      if (scrollTop === undefined) return;
      
      // Determine scroll direction 
      const isScrollingDown = scrollTop > lastScrollTop;
      const isScrollingUp = scrollTop < lastScrollTop;
      const scrollDelta = Math.abs(scrollTop - lastScrollTop);
      
      // Only auto-adjust if not in manual override mode
      if (!manualToggleActive) {
        // Mobile-specific behavior: more aggressive auto-collapse with enhanced sensitivity
        if (isMobile) {
          // Enhanced mobile detection:
          // 1. Collapse even with tiny scroll down movement (reduced threshold)
          // 2. Collapse when scrolled beyond 10% of content 
          // 3. Always collapse when near bottom
          // 4. Optional: detect velocity by tracking time between scroll events
          if ((isScrollingDown && !detailsCollapsed && scrollDelta > 2) || 
              (isNearBottom && !detailsCollapsed) || 
              (scrollPercentage > 10 && !detailsCollapsed)) {
            setDetailsCollapsed(true);
          }
          
          // Only expand when explicitly and deliberately scrolling back to top on mobile
          // Increased threshold to prevent accidental expansion
          if (isScrollingUp && detailsCollapsed && isNearTop && 
              (scrollDelta > 15 || scrollPercentage < 5)) {
            setDetailsCollapsed(false);
          }
        } else {
          // Desktop behavior (unchanged)
          // Auto-collapse details when scrolling down in chat (viewing content at bottom)
          if ((isScrollingDown && !detailsCollapsed && scrollDelta > 5) || 
              (scrollPercentage > 30 && !detailsCollapsed)) {
            setDetailsCollapsed(true);
          }
          
          // Auto-expand details when scrolling up and near the top
          if (isScrollingUp && detailsCollapsed && isNearTop && scrollDelta > 20) {
            setDetailsCollapsed(false);
          }
        }
      }
      
      // Update last scroll position
      setLastScrollTop(scrollTop);
    };
    
    // Handler for toggle details event - used by "Toggle details" button in chat
    // and also for our new custom events
    const handleToggleDetails = (e?: Event) => {
      // Check if this is a custom event with state info
      if (e && 'detail' in e && typeof (e as CustomEvent).detail === 'object') {
        const customEvent = e as CustomEvent<{ collapsed?: boolean }>;
        // If event has explicit collapsed state, use it
        if (customEvent.detail && customEvent.detail.collapsed !== undefined) {
          setDetailsCollapsed(customEvent.detail.collapsed);
        } else {
          // Otherwise just toggle current state
          setDetailsCollapsed(!detailsCollapsed);
        }
      } else {
        // Default behavior - just toggle
        setDetailsCollapsed(!detailsCollapsed);
      }
      
      // Set manual toggle flag to prevent auto-collapse overriding user choice
      setManualToggleActive(true);
      
      // Reset the manual toggle flag after a delay
      // This allows the user's choice to persist for a while
      clearTimeout(manualToggleTimeoutRef.current);
      manualToggleTimeoutRef.current = setTimeout(() => {
        setManualToggleActive(false);
      }, 8000); // Extended timeout for better mobile experience
    };

    // Add event listener for our custom chat-scroll event
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      chatContainer.addEventListener('chat-scroll', handleChatScroll);
    }
    
    // Add event listener for participants container scroll
    const participantsContainer = participantsContainerRef.current;
    
    // Set up scroll handler for participants tab with direct state management
    const handleParticipantsScroll = () => {
      if (activeTab !== 'participants' || !participantsContainer) return;
      
      const scrollTop = participantsContainer.scrollTop;
      const scrollHeight = participantsContainer.scrollHeight;
      const clientHeight = participantsContainer.clientHeight;
      const isNearTop = scrollTop < 20;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      const scrollPercentage = (scrollTop / (scrollHeight - clientHeight)) * 100;
      
      console.log('Participants scroll:', { 
        scrollTop, 
        scrollHeight, 
        clientHeight, 
        isNearTop, 
        isNearBottom,
        scrollPercentage 
      });
      
      // Determine scroll direction using the stored last scroll position
      const isScrollingDown = scrollTop > lastScrollTop;
      const isScrollingUp = scrollTop < lastScrollTop;
      const scrollDelta = Math.abs(scrollTop - lastScrollTop);
      
      // Only auto-adjust if not in manual override mode
      if (!manualToggleActive) {
        // Mobile-specific behavior with enhanced sensitivity
        if (isMobile) {
          // Auto-collapse when scrolling down or near bottom
          if ((isScrollingDown && !detailsCollapsed && scrollDelta > 2) || 
              (isNearBottom && !detailsCollapsed) || 
              (scrollPercentage > 10 && !detailsCollapsed)) {
            setDetailsCollapsed(true);
          }
          
          // Auto-expand when deliberately scrolling back to top
          if (isScrollingUp && detailsCollapsed && isNearTop && 
              (scrollDelta > 15 || scrollPercentage < 5)) {
            setDetailsCollapsed(false);
          }
        } else {
          // Desktop behavior
          if ((isScrollingDown && !detailsCollapsed && scrollDelta > 5) || 
              (scrollPercentage > 30 && !detailsCollapsed)) {
            setDetailsCollapsed(true);
          }
          
          if (isScrollingUp && detailsCollapsed && isNearTop && scrollDelta > 20) {
            setDetailsCollapsed(false);
          }
        }
      }
      
      // Save scroll position for next comparison
      setLastScrollTop(scrollTop);
      
      // Also dispatch the custom event for compatibility with existing code
      const scrollEvent = new CustomEvent('chat-scroll', {
        bubbles: true,
        detail: {
          scrollTop,
          isNearTop,
          isNearBottom,
          scrollPercentage: isNaN(scrollPercentage) ? 0 : scrollPercentage
        }
      });
      
      participantsContainer.dispatchEvent(scrollEvent);
    };
    
    // Add scroll event listener to participants container
    if (participantsContainer) {
      participantsContainer.addEventListener('scroll', handleParticipantsScroll);
    }
    
    // Add document-level listener for chat-scroll events
    // This ensures we catch events even on mobile where bubbling may not work as expected
    document.addEventListener('chat-scroll', handleChatScroll);
    
    // Add global document event listeners for all toggle events
    document.addEventListener('toggle-meetup-details', handleToggleDetails);
    document.addEventListener('meetup-details-collapsed', handleToggleDetails);
    document.addEventListener('meetup-details-expanded', handleToggleDetails);
    
    return () => {
      if (chatContainer) {
        chatContainer.removeEventListener('chat-scroll', handleChatScroll);
      }
      if (participantsContainer) {
        participantsContainer.removeEventListener('scroll', handleParticipantsScroll);
      }
      document.removeEventListener('chat-scroll', handleChatScroll);
      document.removeEventListener('toggle-meetup-details', handleToggleDetails);
      document.removeEventListener('meetup-details-collapsed', handleToggleDetails);
      document.removeEventListener('meetup-details-expanded', handleToggleDetails);
    };
  }, [activeTab, detailsCollapsed, chatContainerRef, participantsContainerRef, lastScrollTop]);

  // Listen for all custom events related to details collapsing/expanding
  useEffect(() => {
    // Event handler for our custom meetup-details events
    const handleCustomDetailsEvent = (e: Event) => {
      if ('detail' in e && typeof (e as CustomEvent).detail === 'object') {
        const customEvent = e as CustomEvent<{ collapsed?: boolean }>;
        // If event has explicit collapsed state, use it
        if (customEvent.detail && customEvent.detail.collapsed !== undefined) {
          // Only update if different from current state to avoid loops
          if (customEvent.detail.collapsed !== detailsCollapsed) {
            console.log(`[Custom Event] Setting details collapsed to ${customEvent.detail.collapsed}`);
            setDetailsCollapsed(customEvent.detail.collapsed);
            
            // Enable manual toggle mode
            setManualToggleActive(true);
            clearTimeout(manualToggleTimeoutRef.current);
            manualToggleTimeoutRef.current = setTimeout(() => {
              setManualToggleActive(false);
            }, 8000);
          }
        }
      }
    };
    
    // Add listeners for both of our custom events
    document.addEventListener('meetup-details-collapsed', handleCustomDetailsEvent);
    document.addEventListener('meetup-details-expanded', handleCustomDetailsEvent);
    
    return () => {
      document.removeEventListener('meetup-details-collapsed', handleCustomDetailsEvent);
      document.removeEventListener('meetup-details-expanded', handleCustomDetailsEvent);
    };
  }, [detailsCollapsed]);

  const calculateTimeLeft = () => {
    if (!meetup.expiresAt) {
      setTimeLeft(null);
      return;
    }

    const expiryDate = new Date(meetup.expiresAt);
    const now = new Date();
    const diffInSeconds = Math.round((expiryDate.getTime() - now.getTime()) / 1000);

    setTimeLeft(Math.max(0, diffInSeconds));
  };

  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe((message) => {
      if (message.type === 'location_update' && message.meetupId === meetup.id) {
        setLocations(prev => {
          const next = new Map(prev);
          next.set(message.userId, {
            userId: message.userId,
            username: message.username,
            location: message.location
          });
          return next;
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [meetup.id, subscribe, setLocations]);

  const isParticipant = user && (
    participants.some(p => p.id === user.id) ||
    meetup.creator_id === user.id
  );

  // Early return component showing participant panel when user is participant
  if (!user || !isParticipant) {
    return null;
  }

  const isCreator = meetup.creator_id === user?.id;

  const handleAction = async (action: 'complete' | 'leave' | 'remove' | 'extend', userId?: number) => {
    try {
      if (action === 'extend') {
        const createdAtDate = new Date(meetup.createdAt || new Date());
        const maxExpiryTime = new Date(createdAtDate.getTime() + 24 * 60 * 60 * 1000);
        const now = new Date();
        const maxExtensionHours = Math.floor((maxExpiryTime.getTime() - now.getTime()) / (1000 * 60 * 60));

        if (maxExtensionHours <= 0) {
          toast({
            title: "Cannot extend duration",
            description: `This Meet has reached its maximum duration of 24 hours from creation time (created ${formatDistanceToNow(createdAtDate, { addSuffix: true })}).`,
            variant: "destructive"
          });
          return;
        }

        setShowExtendDialog(true);
        setMaxExtensionHours(maxExtensionHours);
        return;
      }

      if (action === 'complete') {
        setIsCompleting(true);
      }

      console.log(`[${action} Meetup] Sending request for meetup ${meetup.id}`);

      const endpoint = action === 'complete'
        ? `/api/meetups/${meetup.id}/complete`
        : userId
          ? `/api/meetups/${meetup.id}/members/${userId}/remove`
          : `/api/meetups/${meetup.id}/${action}`;

      const response = await fetch(endpoint, {
        method: action === 'remove' ? 'DELETE' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`[${action} Meetup] Response status:`, response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error(`[${action} Meetup] Error:`, error);
        throw new Error(error.error || `Failed to ${action} meetup`);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/participants`] }),
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/user-status'] })
      ]);

      if (action === 'complete') {
        toast({
          title: "Success",
          description: "Meet ended successfully. Redirecting to rating page...",
          duration: 3000,
        });

        setTimeout(() => {
          setLocation(`/rate/${meetup.id}`);
        }, 1500);
      } else {
        toast({
          title: "Success",
          description: action === 'leave' || action === 'remove' ? `Meet ${action}d successfully` : `Meet ${action === 'extend' ? 'duration extended' : action} successfully`,
        });
      }
    } catch (error) {
      console.error(`[${action} Meetup] Action error:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${action} Meet`,
        variant: "destructive"
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const handleExtendDuration = async (hours: number) => {
    try {
      const response = await fetch(`/api/meetups/${meetup.id}/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hours }),
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/participants`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetup.id}/requests`] })
      ]);

      calculateTimeLeft();

      toast({
        title: "Duration Extended",
        description: `Meet duration has been extended by ${hours} hour${hours > 1 ? 's' : ''}.`
      });

      setShowExtendDialog(false);
    } catch (error) {
      toast({
        title: "Failed to extend duration",
        description: error instanceof Error ? error.message : "Failed to extend Meet duration",
        variant: "destructive"
      });
    }
  };

  // Touch event handlers for collapsible details
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    // Enhanced touch gesture detection with reduced threshold for mobile
    // Dragging down expands, dragging up collapses
    
    // More sensitive thresholds for mobile
    const collapseThreshold = -40; // px (reduced from -50)
    const expandThreshold = 40;    // px (reduced from 50)
    
    if (deltaY < collapseThreshold && !detailsCollapsed) {
      // Collapse when dragging up
      setDetailsCollapsed(true);
      setIsDragging(false);
      
      // Enable manual toggle mode on touch drag with extended timeout
      setManualToggleActive(true);
      clearTimeout(manualToggleTimeoutRef.current);
      manualToggleTimeoutRef.current = setTimeout(() => {
        setManualToggleActive(false);
      }, 8000); // Extended from 5000ms to 8000ms for mobile
      
      // Dispatch a synthetic event to document for any parent listeners
      const touchEvent = new CustomEvent('meetup-details-collapsed', {
        bubbles: true,
        detail: { collapsed: true }
      });
      document.dispatchEvent(touchEvent);
      
    } else if (deltaY > expandThreshold && detailsCollapsed) {
      // Expand when dragging down
      setDetailsCollapsed(false);
      setIsDragging(false);
      
      // Enable manual toggle mode on touch drag with extended timeout
      setManualToggleActive(true);
      clearTimeout(manualToggleTimeoutRef.current);
      manualToggleTimeoutRef.current = setTimeout(() => {
        setManualToggleActive(false);
      }, 8000); // Extended from 5000ms to 8000ms for mobile
      
      // Dispatch a synthetic event to document for any parent listeners
      const touchEvent = new CustomEvent('meetup-details-expanded', {
        bubbles: true,
        detail: { collapsed: false }
      });
      document.dispatchEvent(touchEvent);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      
      {/* Drag indicator for mobile users with collapse/expand visual cue */}
      <div 
        className="w-full flex justify-center items-center py-1 cursor-pointer touch-manipulation"
        onClick={() => {
          const newCollapsedState = !detailsCollapsed;
          setDetailsCollapsed(newCollapsedState);
          
          // Enable manual toggle mode when clicked with extended timeout for better user experience
          setManualToggleActive(true);
          // Reset the manual toggle flag after a delay
          clearTimeout(manualToggleTimeoutRef.current);
          manualToggleTimeoutRef.current = setTimeout(() => {
            setManualToggleActive(false);
          }, 8000); // Extended from 5000ms to 8000ms for better mobile experience
          
          // Dispatch a synthetic event to document for any parent listeners
          const eventName = newCollapsedState ? 'meetup-details-collapsed' : 'meetup-details-expanded';
          const toggleEvent = new CustomEvent(eventName, {
            bubbles: true,
            detail: { collapsed: newCollapsedState }
          });
          document.dispatchEvent(toggleEvent);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex flex-col items-center">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mb-1" />
          <div className="flex h-5 w-10 items-center justify-center rounded-full bg-muted/60">
            {detailsCollapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground/70" />
            )}
          </div>
        </div>
        {detailsCollapsed && (
          <div className="flex items-center gap-2 ml-6">
            <div className="text-xs font-medium text-muted-foreground/80">
              {meetup.title.length > 20 ? meetup.title.substring(0, 20) + '...' : meetup.title}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
              <Users className="h-3 w-3" />
              <span>{participants.length}/{meetup.maxParticipants}</span>
            </div>
            {timeLeft !== null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                <Timer className="h-3 w-3" />
                <span>{formatDistanceToNow(new Date(Date.now() + timeLeft * 1000), { addSuffix: true })}</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Meet details header - collapsible section */}
      <div 
        className={cn(
          "flex flex-col gap-2 bg-background px-2 relative transition-all duration-300 ease-in-out",
          detailsCollapsed ? "max-h-0 overflow-hidden opacity-0 pb-0 mb-0" : "max-h-[1000px] opacity-100 pb-4 mb-8"
        )}
        id="meetup-header"
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold break-words">{meetup.title}</h3>
          <div className="text-sm text-muted-foreground break-words whitespace-pre-wrap">
            {meetup.description}
          </div>
        </div>
        {isCreator && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => handleAction('extend')}
              className="flex-1 min-w-[140px]"
              disabled={isCompleting}
            >
              <Clock className="h-4 w-4 mr-2" />
              Extend Duration
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleAction('complete')}
              className="flex-1 min-w-[140px]"
              disabled={isCompleting}
            >
              {isCompleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ending Meet...
                </>
              ) : (
                'End Meet'
              )}
            </Button>
          </div>
        )}
        {!isCreator && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              variant="destructive"
              onClick={() => handleAction('leave')}
              size="sm"
            >
              Leave Meet
            </Button>
          </div>
        )}
      </div>

      {/* Meet info card - hidden when details collapsed */}
      <div className={cn(
        "grid gap-4 px-2 transition-all duration-300 ease-in-out",
        detailsCollapsed ? "max-h-0 overflow-hidden opacity-0 mb-0" : "max-h-[1000px] opacity-100 mb-6"
      )}>
        <Card className="p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm whitespace-nowrap">Theme: </span>
              <span className="text-sm font-medium capitalize truncate">{meetup.theme}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm whitespace-nowrap">Participants: </span>
              <span className="text-sm font-medium">
                {participants.length} / {meetup.maxParticipants}
                {participants.length >= meetup.maxParticipants && (
                  <span className="ml-1 text-xs text-muted-foreground">(Full)</span>
                )}
              </span>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-2 items-start max-w-full">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm whitespace-nowrap">Location:</span>
              </div>
              <span className="text-sm font-medium break-words">{meetup.exactLocation}</span>
            </div>
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm whitespace-nowrap">Expires: </span>
              <span className="text-sm font-medium">
                {timeLeft !== null
                  ? new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: 'numeric',
                      hour12: true
                    }).format(new Date(Date.now() + timeLeft * 1000))
                  : 'Calculating...'
                  }
              </span>
            </div>
          </div>

          {/* Show demographic filters for creators only */}
          {isCreator && (meetup.genderFilter || meetup.minAgeFilter || meetup.maxAgeFilter) && (
            <div className="mt-4 text-sm border-t pt-4">
              <h4 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                <FilterIcon className="h-4 w-4" />
                Demographic Filters
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {meetup.genderFilter && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="rounded-md flex items-center gap-2 py-1 px-2 bg-muted/50 border-muted-foreground/20">
                      <Users className="h-3.5 w-3.5 text-primary/70" />
                      <span>Gender: <span className="font-medium">{meetup.genderFilter}</span></span>
                    </Badge>
                  </div>
                )}
                {(meetup.minAgeFilter || meetup.maxAgeFilter) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="rounded-md flex items-center gap-2 py-1 px-2 bg-muted/50 border-muted-foreground/20">
                      <CalendarClock className="h-3.5 w-3.5 text-primary/70" />
                      <span>Age: {meetup.minAgeFilter ? `${meetup.minAgeFilter}+` : ''}
                      {meetup.minAgeFilter && meetup.maxAgeFilter ? ' to ' : ''}
                      {meetup.maxAgeFilter ? `${meetup.maxAgeFilter} or under` : ''}</span>
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Tabs container - fills remaining height with scrollable content */}
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab} 
        className="flex-1 flex flex-col overflow-hidden">
        <TabsList 
          className="w-full bg-background border-b rounded-none px-4 sticky top-0 z-50 shadow-sm">
          <TabsTrigger 
            value="participants" 
            className={cn(
              "flex-1 relative",
              activeTab === "participants" ? "font-medium" : "font-normal"
            )}
          >
            <div className="flex items-center justify-center">
              <Users className="h-4 w-4 mr-2" />
              Participants
              {activeTab === "participants" && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-[3px] bg-primary rounded-t-full" />
              )}
            </div>
          </TabsTrigger>
          <TabsTrigger 
            value="chat" 
            className={cn(
              "flex-1 relative",
              activeTab === "chat" ? "font-medium" : "font-normal"
            )}
            onClick={() => {
              // Set a few timeouts to make sure the scroll happens after the tab content is visible
              setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50);
              setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 150);
              setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 300);
            }}
          >
            <div className="flex items-center justify-center">
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
              {activeTab === "chat" && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-[3px] bg-primary rounded-t-full" />
              )}
            </div>
          </TabsTrigger>
        </TabsList>

        {/* Participants tab content - scrollable container */}
        <TabsContent 
          value="participants" 
          className="flex-1 p-0 data-[state=active]:flex flex-col overflow-y-auto hide-scrollbar"
          style={{
            minHeight: '100%'
          }}
          ref={participantsContainerRef}
        >
          {/* Participant header removed */}
          
          <div className="h-full px-4 pb-4 pt-2">
            <div className="space-y-4">
              {meetup.creator_username && (
                meetup.group_id ? (
                  <div className="rounded-lg border p-4">
                    <p className="font-medium">
                      Created by group:{" "}
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => setShowGroupMembers(true)}
                      >
                        {meetup.creator_group_name ||
                          meetup.creator_displayName ||
                          meetup.creator_username}
                      </button>
                    </p>
                  </div>
                ) : (
                  <ParticipantCard
                    participant={{
                      id: meetup.creator_id || 0,
                      username: meetup.creator_username || '',
                      createdAt: typeof meetup.createdAt === 'string' ? meetup.createdAt : new Date().toISOString()
                    }}
                    isCreator={false}
                    currentUser={user}
                    onClick={() => setSelectedUser({
                      id: meetup.creator_id || 0,
                      username: meetup.creator_username || ''
                    })}
                    showCreatorBadge
                  />
                )
              )}

              {participants.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground px-1">Members</h4>
                  {participants.filter(p => p.id !== meetup.creator_id).map((participant) => (
                    <ParticipantCard
                      key={participant.id}
                      participant={participant}
                      isCreator={isCreator}
                      currentUser={user}
                      onRemove={(id) => handleAction('remove', id)}
                      onClick={() => setSelectedUser({ id: participant.id, username: participant.username })}
                    />
                  ))}
                </div>
              )}

              {!participants.length && !requests?.length && (
                <div className="text-center py-8 text-muted-foreground">
                  No participants yet
                </div>
              )}
              
              {isCreator && requests && requests.length > 0 && (
                <div className="space-y-2 mt-6">
                  <h4 className="text-sm font-medium text-muted-foreground px-1">Pending Requests</h4>
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => setSelectedUser({
                        id: request.user_id,
                        username: request.username || 'Anonymous'
                      })}
                    >
                      <ProfileAvatar
                        username={request.username || 'Anonymous'}
                        displayName={request.displayName}
                        profilePicture={request.profilePicture}
                        size="md"
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          {request.displayName || request.username}
                          {request.displayName && request.username && (
                            <span className="text-muted-foreground text-sm ml-1">@{request.username}</span>
                          )}
                        </div>
                        <div className="text-sm">
                          <div className="text-foreground/80 mt-1">
                            {request.message || "No message provided"}
                          </div>
                          <UseTraitsBadges userId={request.user_id} />
                          <div className="text-muted-foreground mt-1">
                            Requested {request.createdAt && new Intl.DateTimeFormat('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: 'numeric',
                              hour12: true
                            }).format(new Date(request.createdAt))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
                          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRequest({ requestId: request.id, meetupId: meetup.id, status: 'rejected' });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRequest({ requestId: request.id, meetupId: meetup.id, status: 'accepted' });
                            
                            // Create confetti celebration animation
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
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isCreator && groupRequests.length > 0 && (
                <div className="space-y-2 mt-6">
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
                          Requested for everyone in this group
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleGroupRequestDecision(request, "rejected")
                          }
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleGroupRequestDecision(request, "accepted")
                          }
                        >
                          Accept group
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add some padding at the bottom for mobile */}
              {isMobile && <div className="h-8" />}
            </div>
          </div>
        </TabsContent>

        {/* Chat tab content - independent scrolling area with container positioning context */}
        <TabsContent
          value="chat"
          className="flex-1 p-0 m-0 data-[state=active]:flex flex-col overflow-hidden relative"
          style={{ minHeight: '100%' }}
          ref={chatContainerRef}
        >
          {user?.id ? (
            <ChatWindow
              meetupId={meetup.id}
              currentUserId={user.id}
              currentUsername={user.username || 'Anonymous'}
              currentUserPicture={user.profilePicture}
              isMobileChat={isMobile && activeTab === 'chat'}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4" />
              <h3 className="text-lg font-semibold">Please sign in to chat</h3>
              <p>You need to be signed in to participate in the chat.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogTitle>Extend Meet Duration</DialogTitle>
          <DialogDescription>
            Choose how many hours to extend the Meet. Total duration cannot exceed 24 hours from creation time.
            Maximum extension: {maxExtensionHours} hours
          </DialogDescription>
          <div className="grid grid-cols-2 gap-4 py-4">
            {[1, 2, 3, 4].map((hours) => (
              hours <= maxExtensionHours && (
                <Button
                  key={hours}
                  onClick={() => handleExtendDuration(hours)}
                  variant="outline"
                >
                  +{hours} {hours === 1 ? 'Hour' : 'Hours'}
                </Button>
              )
            ))}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowExtendDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      
      {/* Handle join requests in a separate component if needed */}
      {requests && requests.length > 0 && selectedUser && (
        <Dialog
          open={!!selectedUser && !!requests?.find(r => r.user_id === selectedUser?.id)}
          onOpenChange={(open) => !open && setSelectedUser(null)}
        >
          <DialogContent>
            <DialogTitle>Join Request</DialogTitle>
            <DialogDescription>
              {/* Find the request to get displayName if available */}
              {(() => {
                const request = requests?.find(r => r.user_id === selectedUser?.id);
                return (
                  <>
                    {request?.displayName || selectedUser?.username} has requested to join this Meet.
                    Would you like to accept or reject their request?
                  </>
                );
              })()}
            </DialogDescription>
            <DialogFooter className="flex justify-end gap-2 mt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  const requestId = requests?.find(r => r.user_id === selectedUser?.id)?.id;
                  if (requestId) {
                    handleRequest({ requestId, meetupId: meetup.id, status: 'rejected' });
                    setSelectedUser(null);
                  }
                }}
              >
                Reject
              </Button>
              <Button 
                onClick={(e) => {
                  const requestId = requests?.find(r => r.user_id === selectedUser?.id)?.id;
                  if (requestId) {
                    handleRequest({ requestId, meetupId: meetup.id, status: 'accepted' });
                    setSelectedUser(null);
                    
                    // Create confetti celebration animation
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
                  }
                }}
              >
                Accept
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
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
          {trait.totalVotes && trait.totalVotes !== trait.endorsements && (
            <>
              <span className="text-muted-foreground text-xs">({trait.totalVotes} votes)</span>
            </>
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
  );
}