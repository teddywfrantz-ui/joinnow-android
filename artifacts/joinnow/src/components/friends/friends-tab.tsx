import { useState, useEffect } from "react";
import { useFriendRequests } from "@/hooks/use-friend-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, UserPlus, UserX, Search, Clock, Check, X, Loader2, LogIn, 
  History, UserCheck, Calendar 
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { type User } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { UserProfileModal } from "@/components/users/user-profile-modal";

// Define interface for Recent Participant
interface RecentParticipant {
  id: number;
  username: string;
  displayName?: string;
  createdAt: string;
  lastMeetupAt: string;
  isFriend: boolean;
  profilePicture?: string | null;
}

export function FriendsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient(); // Add QueryClient for manual invalidation
  const { 
    requests = [], 
    friends = [], 
    isLoadingRequests = false, 
    isLoadingFriends = false, 
    handleRequest, 
    sendRequest, 
    outgoingRequests = [], 
    isLoadingOutgoingRequests = false,
    isOutgoingRequestsError = false,
    removeFriend, 
    cancelRequest,
    refetchOutgoingRequests
  } = useFriendRequests();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("friends");
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  
  // Effect to refresh data when tabs are changed
  useEffect(() => {
    if (activeTab === "sent") {
      console.log("Refreshing outgoing friend requests data");
      // Invalidate and refetch outgoing requests when the sent tab is selected
      queryClient.invalidateQueries({ queryKey: ['/api/friends/outgoing-requests'] });
      refetchOutgoingRequests?.();
    } else if (activeTab === "requests") {
      console.log("Refreshing incoming friend requests data");
      // Invalidate and refetch incoming requests when the requests tab is selected
      queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });
    } else if (activeTab === "friends") {
      console.log("Refreshing friends list data");
      // Invalidate and refetch friends list when the friends tab is selected
      queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
    }
  }, [activeTab, queryClient, refetchOutgoingRequests]);
  
  // Query for recent participants
  const { 
    data: recentParticipants = [], 
    isLoading: isLoadingRecents = false,
    error: recentsError
  } = useQuery<RecentParticipant[]>({
    queryKey: ['/api/friends/recent'],
    queryFn: async () => {
      console.log("Fetching recent participants, user:", user?.username);
      if (!user) return [];
      try {
        const res = await fetch('/api/friends/recent');
        console.log("Recent participants API response status:", res.status);
        if (!res.ok) {
          const errorText = await res.text();
          console.error("Recent participants API error:", errorText);
          throw new Error(errorText);
        }
        const data = await res.json();
        console.log("Recent participants data:", data);
        return data;
      } catch (err) {
        console.error("Error fetching recent participants:", err);
        throw err;
      }
    },
    enabled: !!user,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'accepted':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const handleSearch = async (newSearch = true) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to search for users",
        variant: "destructive"
      });
      return;
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasMoreResults(false);
      setTotalResults(0);
      return;
    }

    // Reset page to 1 if it's a new search
    if (newSearch) {
      setSearchPage(1);
    }

    const currentPage = newSearch ? 1 : searchPage;
    const limit = 10; // Number of results per page

    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}&page=${currentPage}&limit=${limit}`, 
        { credentials: 'include' }
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      
      // Validate data shape
      const users = data?.users || [];
      const hasMore = !!data?.hasMore;
      const total = data?.total || 0;
      
      // If it's a new search, replace results; otherwise append
      const updatedResults = newSearch ? users : [...(searchResults || []), ...users];
      setSearchResults(updatedResults);
      setHasMoreResults(hasMore);
      setTotalResults(total);
      
      // Update page for next fetch
      if (!newSearch) {
        setSearchPage(currentPage + 1);
      } else {
        setSearchPage(2); // Set to 2 for the next page load
      }

      if (newSearch && data.total === 0) {
        toast({
          title: "No Results",
          description: `No users found matching "${searchQuery}"`,
          variant: "default"
        });
      }
    } catch (error) {
      console.error("Search failed:", error);
      toast({
        title: "Search Failed",
        description: "Failed to search for users. Please try again.",
        variant: "destructive"
      });
      if (newSearch) {
        setSearchResults([]);
        setHasMoreResults(false);
        setTotalResults(0);
      }
    } finally {
      setIsSearching(false);
    }
  };
  
  // Function to load more results when scrolling to the bottom
  const loadMoreResults = () => {
    if (!isSearching && hasMoreResults) {
      handleSearch(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Sign in to Search Users</h3>
        <p className="text-muted-foreground mb-4">
          Connect with friends and join meetups together
        </p>
        <Link href="/auth">
          <Button className="gap-2 w-full sm:w-auto">
            <LogIn className="h-4 w-4" />
            Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-2 sm:p-4 gap-2 sm:gap-4">
      {/* User Profile Modal */}
      <UserProfileModal 
        userId={selectedUserId}
        open={!!selectedUserId}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
      />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="friends" className="flex items-center justify-center">
            <Users className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline truncate">Friends</span>
            {/* Badge for mobile */}
            {friends?.length > 0 && (
              <span className="inline sm:hidden ml-1 text-xs bg-primary/20 rounded-full px-1.5">
                {friends.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center justify-center">
            <UserPlus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline truncate">
              {requests?.filter(r => r.status === 'pending').length > 0 ? 
                `Received (${requests.filter(r => r.status === 'pending').length})` : 
                'Received'
              }
            </span>
            {/* Badge for mobile */}
            {requests?.filter(r => r.status === 'pending').length > 0 && (
              <span className="inline sm:hidden ml-1 text-xs bg-primary/20 rounded-full px-1.5">
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex items-center justify-center">
            <UserCheck className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline truncate">
              {outgoingRequests?.length > 0 ? 
                `Sent (${outgoingRequests.length})` : 
                'Sent'
              }
            </span>
            {/* Badge for mobile */}
            {outgoingRequests?.length > 0 && (
              <span className="inline sm:hidden ml-1 text-xs bg-primary/20 rounded-full px-1.5">
                {outgoingRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="recents" className="flex items-center justify-center">
            <History className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline truncate">Recents</span>
            {/* Badge for mobile */}
            {recentParticipants && recentParticipants.length > 0 && (
              <span className="inline sm:hidden ml-1 text-xs bg-primary/20 rounded-full px-1.5">
                {recentParticipants.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center justify-center">
            <Search className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline truncate">Search</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="space-y-2 sm:space-y-4">
              {isLoadingFriends ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading friends...</span>
                </div>
              ) : friends && friends.length > 0 ? (
                friends.map((friend) => (
                  <Card key={friend.id} className="p-2 sm:p-4">
                    <div className="flex items-center justify-between w-full">
                      {/* Left Side: Avatar + Name */}
                      <div 
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => setSelectedUserId(friend.id)} 
                      >
                        <ProfileAvatar
                          profilePicture={friend.profilePicture}
                          username={friend.username}
                          displayName={friend.displayName}
                          size="md"
                        />
                        <div>
                          <p className="font-semibold">{friend.displayName || friend.username}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <span className="text-muted-foreground">@{friend.username}</span>
                            <Check className="inline-block h-4 w-4 ml-1 text-green-500" />
                          </p>
                        </div>
                      </div>

                      {/* Right Side: Remove Friend Button */}
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => removeFriend(friend.id)}
                        className="w-10 h-10 shrink-0 flex items-center justify-center"
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No friends yet
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="recents" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="space-y-2 sm:space-y-4">
              {isLoadingRecents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading recent participants...</span>
                </div>
              ) : recentParticipants && recentParticipants.length > 0 ? (
                recentParticipants.map((participant) => (
                  <Card key={participant.id} className="p-2 sm:p-4">
                    <div className="flex items-center justify-between w-full">
                      {/* Left Side: Avatar + Name */}
                      <div 
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => setSelectedUserId(participant.id)}
                      >
                        <ProfileAvatar
                          profilePicture={participant.profilePicture}
                          username={participant.username}
                          displayName={participant.displayName}
                          size="md"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{participant.displayName || participant.username}</p>
                            {participant.isFriend && (
                              <Badge variant="outline" className="px-2 py-0.5 h-5 bg-green-100 text-green-800 border-green-200">
                                <UserCheck className="h-3 w-3 mr-1" />
                                Friend
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center text-sm text-muted-foreground gap-1">
                            <span>@{participant.username}</span>
                            <span className="mx-1">•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Met {
                                participant.lastMeetupAt && !isNaN(new Date(participant.lastMeetupAt).getTime()) 
                                  ? formatDistanceToNow(new Date(participant.lastMeetupAt), { addSuffix: true })
                                  : 'recently'
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Action Button */}
                      {!participant.isFriend && (
                        <Button
                          onClick={() => sendRequest(participant.id)}
                          className="w-8 h-8 sm:w-auto sm:px-3 flex items-center gap-1 sm:gap-2 justify-center"
                          size="sm"
                        >
                          <UserPlus className="h-4 w-4" />
                          <span className="hidden sm:inline">Add Friend</span>
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No recent Meet participants found
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="requests" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="space-y-2 sm:space-y-4">
              {isLoadingRequests ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading requests...</span>
                </div>
              ) : requests && requests.filter(r => r.status === 'pending').length > 0 ? (
                requests.filter(r => r.status === 'pending').map((request) => (
                  <Card key={request.id} className="p-2 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div 
                        className="flex items-center gap-2 min-w-0 cursor-pointer"
                        onClick={() => request.sender?.id && setSelectedUserId(request.sender.id)}
                      >
                        <ProfileAvatar
                          profilePicture={request.sender?.profilePicture}
                          username={request.sender?.username || ""}
                          displayName={request.sender?.displayName}
                          size="sm"
                        />
                        <div className="overflow-hidden">
                          <div className="font-medium truncate">{request.sender?.displayName || request.sender?.username}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <span className="truncate">@{request.sender?.username}</span>
                            <Clock className="h-3 w-3 shrink-0 ml-1" />
                            <span className="truncate">
                              {request.createdAt && !isNaN(new Date(request.createdAt).getTime()) 
                                ? formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })
                                : 'recently'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                      {request.status === 'pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleRequest({ requestId: request.id, status: 'rejected' })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            onClick={() => handleRequest({ requestId: request.id, status: 'accepted' })}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No pending friend requests
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="sent" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="space-y-2 sm:space-y-4">
              {isLoadingOutgoingRequests ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading sent requests...</span>
                </div>
              ) : isOutgoingRequestsError ? (
                <div className="text-center py-8">
                  <div className="text-destructive mb-2">Error loading sent requests</div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    <Loader2 className="h-3 w-3 mr-2" />
                    Retry
                  </Button>
                </div>
              ) : outgoingRequests && outgoingRequests.length > 0 ? (
                outgoingRequests.map((request) => (
                  <Card key={request.id} className="p-2 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div 
                        className="flex items-center gap-2 min-w-0 cursor-pointer"
                        onClick={() => request.recipient?.id && setSelectedUserId(request.recipient.id)}
                      >
                        {/* Debug info to view API response shape */}
                        {process.env.NODE_ENV === 'development' && (
                          <div className="hidden">{JSON.stringify({
                            id: request.id,
                            recipientId: request.recipientId,
                            recipientObj: request.recipient ? 'exists' : 'missing',
                            recipientName: request.recipient?.username
                          })}</div>
                        )}
                        
                        <ProfileAvatar
                          profilePicture={request.recipient?.profilePicture}
                          username={request.recipient?.username || "Unknown User"}
                          displayName={request.recipient?.displayName}
                          size="sm"
                        />
                        <div className="overflow-hidden">
                          <div className="font-medium truncate">
                            {request.recipient?.displayName || request.recipient?.username || "Unknown User"}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <span className="truncate">
                              @{request.recipient?.username || "user"}
                            </span>
                            <Clock className="h-3 w-3 shrink-0 ml-1" />
                            <span className="truncate">
                              {request.createdAt && !isNaN(new Date(request.createdAt).getTime()) 
                                ? formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })
                                : 'recently'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelRequest(request.id)}
                          className="h-8 px-3 flex items-center gap-1 sm:gap-2"
                        >
                          <X className="h-4 w-4" />
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                        <Badge variant="secondary" className="h-8 px-3">
                          {request.status === 'pending' ? (
                            <Clock className="h-3 w-3 mr-1" />
                          ) : request.status === 'accepted' ? (
                            <Check className="h-3 w-3 mr-1 text-green-500" />
                          ) : (
                            <X className="h-3 w-3 mr-1 text-red-500" />
                          )}
                          <span>{request.status === 'pending' ? 'Pending' : 
                                 request.status === 'accepted' ? 'Accepted' : 'Rejected'}</span>
                        </Badge>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No sent friend requests
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="search" className="flex-1 mt-0">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch(true);
                    }
                  }}
                  className="pl-9"
                />
                {isSearching && (!searchResults || searchResults.length === 0) && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              <Button 
                onClick={(e) => {
                  e.preventDefault();
                  handleSearch(true);
                }} 
                disabled={isSearching && (!searchResults || searchResults.length === 0)} 
                className="w-full sm:w-auto flex items-center justify-center gap-2"
              >
                <Search className="h-4 w-4 sm:hidden" />
                <span>Search</span>
              </Button>
            </div>
            
            {totalResults > 0 && searchQuery && (
              <div className="text-sm text-muted-foreground px-1">
                Found {totalResults} {totalResults === 1 ? 'user' : 'users'} matching "{searchQuery}"
              </div>
            )}

            <ScrollArea 
              className="h-[calc(100vh-12rem)]"
              onScroll={(e) => {
                const target = e.currentTarget;
                const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
                const scrollThreshold = 200; // Increased threshold to trigger earlier
                
                console.log("Scroll position:", {
                  scrollBottom,
                  scrollHeight: target.scrollHeight,
                  scrollTop: target.scrollTop,
                  clientHeight: target.clientHeight,
                  hasMore: hasMoreResults,
                  isSearching
                });
                
                if (scrollBottom < scrollThreshold && hasMoreResults && !isSearching) {
                  console.log("Loading more results");
                  loadMoreResults();
                }
              }}
            >
              <div className="space-y-2 sm:space-y-4">
                {searchResults && searchResults.length > 0 ? (
                  <>
                    {searchResults.map((searchedUser) => {
                      // Make sure we have valid searchedUser data before proceeding
                      if (!searchedUser || !searchedUser.id) return null;
                      
                      // Check for pending requests to this user, checking both recipient.id and recipientId fields
                      const pendingRequest = outgoingRequests?.find(
                        req => (req.recipient?.id === searchedUser.id || req.recipientId === searchedUser.id) && 
                               req.status === 'pending'
                      );
                      
                      // Log request check for debugging
                      console.log(`Friend request check for user ${searchedUser.username} (${searchedUser.id}):`, { 
                        hasPendingRequest: !!pendingRequest,
                        requestId: pendingRequest?.id,
                        outgoingRequestCount: outgoingRequests?.length || 0
                      });
                      const isFriend = friends?.some(f => f.id === searchedUser.id);

                      return (
                        <Card key={searchedUser.id} className="p-2 sm:p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div 
                              className="flex items-center gap-2 min-w-0 cursor-pointer" 
                              onClick={() => setSelectedUserId(searchedUser.id)}
                            >
                              <ProfileAvatar
                                profilePicture={searchedUser.profilePicture}
                                username={searchedUser.username}
                                displayName={searchedUser.displayName}
                                size="sm"
                              />
                              <div className="flex flex-col">
                                <span className="font-medium truncate">{searchedUser.displayName || searchedUser.username}</span>
                                <span className="text-xs text-muted-foreground truncate">@{searchedUser.username}</span>
                              </div>
                            </div>
                            {pendingRequest ? (
                              <Button
                                variant="outline"
                                onClick={() => cancelRequest(pendingRequest.id)}
                                className="w-8 h-8 sm:w-auto sm:min-w-[140px] sm:h-auto px-2 sm:px-4 flex items-center gap-1 sm:gap-2 justify-center"
                              >
                                <X className="h-4 w-4" />
                                <span className="hidden sm:inline-block">Cancel Request</span>
                              </Button>
                            ) : isFriend ? (
                              <Badge variant="outline" className="px-2 py-0.5 h-8 flex items-center bg-green-100 text-green-800 border-green-200">
                                <Check className="h-4 w-4 mr-1" />
                                <span>Friend</span>
                              </Badge>
                            ) : (
                              <Button
                                onClick={async () => {
                                  try {
                                    await sendRequest(searchedUser.id);
                                  } catch (error) {
                                    console.error('Failed to send friend request:', error);
                                  }
                                }}
                                className="w-8 h-8 sm:w-auto sm:min-w-[140px] sm:h-auto px-2 sm:px-4 flex items-center gap-1 sm:gap-2 justify-center"
                              >
                                <UserPlus className="h-4 w-4" />
                                <span className="hidden sm:inline-block">Add Friend</span>
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                    
                    {/* Loading indicator for infinite scroll */}
                    {isSearching && (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                    
                    {/* Load more button or end message */}
                    {!isSearching && searchResults && searchResults.length > 0 && (
                      <div className="text-center py-4">
                        {hasMoreResults ? (
                          <Button 
                            variant="outline" 
                            className="w-full max-w-xs mx-auto"
                            onClick={() => loadMoreResults()}
                          >
                            Load More Results
                          </Button>
                        ) : (
                          <div className="text-muted-foreground text-sm py-2">
                            No more users found
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery && !isSearching ? 'No users found matching your search' : 'Search for users to add as friends'}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}