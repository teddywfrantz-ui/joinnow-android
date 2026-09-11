import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@db/schema';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import { useEffect } from 'react';

export interface FriendRequest {
  id: number;
  senderId?: number;
  recipientId?: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt?: string;
  sender?: User;
  recipient?: User;
}

import { WebSocketMessage } from '@/hooks/use-websocket';

type FriendRequestMessage = {
  type: 'friend_request' | 'friend_request_update';
  recipientId?: number;
  requestId?: number;
  status?: 'accepted' | 'rejected';
  userId?: number;
  username?: string;
};

export function useFriendRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sendMessage, subscribe } = useWebSocket();

  // Subscribe to WebSocket updates for friend requests
  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe((message) => {
      if (message.type === 'friend_request' || message.type === 'friend_request_update') {
        // Only invalidate friend-related queries
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/friends'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/friends/outgoing-requests'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
          // Also invalidate stats when friend status changes
          queryClient.invalidateQueries({ queryKey: ['/api/users', 'stats'] })
        ]);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [subscribe, queryClient]);

  // Query for getting received friend requests
  const { data: requests = [], isLoading: isLoadingRequests } = useQuery<FriendRequest[]>({
    queryKey: ['/api/friends/requests'],
    queryFn: async () => {
      const res = await fetch('/api/friends/requests', {
        credentials: 'include'
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    retry: false
  });

  // Query for getting friends list (now includes both directions)
  const { data: friends = [], isLoading: isLoadingFriends } = useQuery<User[]>({
    queryKey: ['/api/friends'],
    queryFn: async () => {
      const res = await fetch('/api/friends', {
        credentials: 'include'
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    retry: false
  });

  // Query for getting user's outgoing friend requests
  const { 
    data: outgoingRequests = [], 
    refetch: refetchOutgoingRequestsInternal,
    isLoading: isLoadingOutgoingRequests,
    isError: isOutgoingRequestsError 
  } = useQuery<FriendRequest[]>({
    queryKey: ['/api/friends/outgoing-requests'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/friends/outgoing-requests', {
          credentials: 'include'
        });
        
        if (!res.ok) {
          if (res.status === 401) {
            console.warn('User not authenticated for outgoing friend requests');
            return []; // Return empty array for unauthorized users
          }
          
          // Try to get detailed error information
          let errorText = '';
          try {
            errorText = await res.text();
            console.error('Outgoing request error response:', errorText);
          } catch (e) {
            console.error('Could not parse error response');
          }
          
          throw new Error(errorText || `Failed to load sent requests (${res.status})`);
        }
        
        const data = await res.json();
        console.log('Outgoing friend requests loaded:', data?.length || 0);
        return data;
      } catch (error) {
        console.error('Error fetching outgoing friend requests:', error);
        throw error; // Let the error propagate to show the error UI
      }
    },
    retry: 1, // Retry once in case of temporary network issues
    staleTime: 5000, // 5 seconds
    gcTime: 10 * 60 * 1000 // 10 minutes before garbage collection
  });

  // Mutation for sending a friend request
  const sendRequest = useMutation({
    mutationFn: async (recipientId: number) => {
      const res = await fetch('/api/friends/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId }),
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to send friend request' }));
        throw new Error(data.error || 'Failed to send friend request');
      }

      const data = await res.json();

      // Notify through WebSocket only if successful
      if (sendMessage && data) {
        sendMessage({
          type: 'friend_request',
          userId: data.senderId || 0, // Using sender ID from response
          requestId: data.id,
          status: 'pending'
        });
      }

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Friend Request Sent",
        description: "Your friend request has been sent successfully.",
      });

      // Only invalidate friend-related queries
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/friends/outgoing-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] })
      ]);
    },
    onError: (error: Error) => {
      console.error('Friend request error:', error);
      
      // Provide user-friendly error messages for common errors
      let errorMessage = error.message;
      
      if (errorMessage.includes("already exists") || errorMessage.includes("already sent")) {
        errorMessage = "You have already sent a friend request to this user.";
      } else if (errorMessage.includes("already friends")) {
        errorMessage = "You are already friends with this user.";
      } else if (errorMessage.includes("yourself")) {
        errorMessage = "You cannot send a friend request to yourself.";
      }
      
      toast({
        title: "Friend Request Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Mutation for handling friend requests (accept/reject)
  const handleRequest = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: number; status: 'accepted' | 'rejected' }) => {
      const res = await fetch(`/api/friends/requests/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      const data = await res.json();

      // Notify through WebSocket
      if (sendMessage) {
        sendMessage({
          type: 'friend_request_update',
          userId: data.senderId || data.recipientId || 0, // Using sender or recipient ID from response
          requestId,
          status
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      const action = variables.status === 'accepted' ? 'accepted' : 'rejected';
      toast({
        title: "Request Handled",
        description: `Friend request ${action} successfully.`,
      });

      // Invalidate all relevant queries including stats
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/friends'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/friends/outgoing-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/users', 'stats'] })
      ]);
    },
    onError: (error: Error) => {
      console.error('Friend request handling error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = error.message;
      
      if (errorMessage.includes("not found")) {
        errorMessage = "This friend request no longer exists. It may have been canceled or already handled.";
      } else if (errorMessage.includes("permission")) {
        errorMessage = "You don't have permission to handle this friend request.";
      }
      
      toast({
        title: "Failed to Handle Request",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });
  
  // Mutation for canceling an outgoing friend request
  const cancelRequest = useMutation({
    mutationFn: async (requestId: number) => {
      console.log("Attempting to cancel request with ID:", requestId);
      
      const res = await fetch(`/api/friends/requests/${requestId}/cancel`, {
        method: 'POST',
        credentials: 'include'
      });

      // Log the response for debugging
      const responseText = await res.text();
      console.log("Cancel request response:", responseText);
      
      if (!res.ok) {
        let errorMessage = 'Failed to cancel friend request';
        
        try {
          // Try to parse the response as JSON if possible
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If parsing fails, use the raw text or default message
          errorMessage = responseText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }
      
      // Notify through WebSocket about cancellation
      if (sendMessage) {
        sendMessage({
          type: 'request_canceled',
          userId: 0, // Will be populated from the session on the server
          requestId: requestId
        });
      }

      return true;
    },
    onSuccess: () => {
      toast({
        title: "Request Canceled",
        description: "Friend request has been canceled.",
      });

      // Invalidate friend-related queries
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/friends/outgoing-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] })
      ]);
    },
    onError: (error: Error) => {
      console.error('Friend request cancellation error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = error.message;
      
      if (errorMessage.includes("not found")) {
        errorMessage = "This friend request no longer exists. It may have been already accepted or rejected.";
      } else if (errorMessage.includes("permission")) {
        errorMessage = "You don't have permission to cancel this friend request.";
      } else if (errorMessage.includes("already")) {
        errorMessage = "This friend request has already been accepted or rejected.";
      }
      
      toast({
        title: "Failed to Cancel Request",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Mutation for removing a friend
  const removeFriend = useMutation({
    mutationFn: async (friendId: number) => {
      const res = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to remove friend' }));
        throw new Error(data.error || 'Failed to remove friend');
      }
      
      // Notify through WebSocket about friend removal
      if (sendMessage) {
        sendMessage({
          type: 'friend_request_update',
          userId: 0, // Will be populated from the session on the server
          requestId: 0, // No specific request ID for removals
          status: 'rejected' // Using rejected status to indicate the connection was terminated
        });
      }

      return true;
    },
    onSuccess: () => {
      toast({
        title: "Friend Removed",
        description: "Friend has been removed from your list.",
      });

      // Invalidate friend-related queries and stats
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/friends'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/users', 'stats'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/friends/recent'] }) // Also invalidate recents
      ]);
    },
    onError: (error: Error) => {
      console.error('Friend removal error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = error.message;
      
      if (errorMessage.includes("not friends")) {
        errorMessage = "You are not currently friends with this user.";
      } else if (errorMessage.includes("not found")) {
        errorMessage = "User not found. They may have deleted their account.";
      } else if (errorMessage.includes("yourself")) {
        errorMessage = "You cannot remove yourself from your friends list.";
      }
      
      toast({
        title: "Failed to Remove Friend",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Function to refetch outgoing requests
  // Direct API method to cancel by recipient ID instead of request ID
  // This is a fallback method when the normal cancelRequest fails
  const cancelRequestByRecipientId = async (recipientId: number) => {
    if (!outgoingRequests) {
      console.error('No outgoing requests data available for cancelRequestByRecipientId');
      return false;
    }
    
    // Enhanced logging to debug the outgoing requests
    console.log(`Searching for request with recipientId ${recipientId} in ${outgoingRequests.length} outgoing requests`);
    outgoingRequests.forEach(req => {
      console.log(`Request ID: ${req.id}, recipientId: ${req.recipientId}, recipient?.id: ${req.recipient?.id}, status: ${req.status}`);
    });
    
    // Find the request for this recipient, checking both recipientId and recipient.id
    const request = outgoingRequests.find(req => 
      (req.recipientId === recipientId || req.recipient?.id === recipientId) && 
      req.status === 'pending'
    );
    
    if (!request?.id) {
      console.error(`No pending request found for recipient ${recipientId}`);
      
      // Try a direct API call as a last resort
      try {
        console.log(`Attempting direct API cleanup for recipient ${recipientId}`);
        const cleanupResult = await fetch(`/api/friends/cleanup-pending-requests?recipientId=${recipientId}`, {
          method: 'POST',
          credentials: 'include'
        });
        
        if (cleanupResult.ok) {
          const data = await cleanupResult.json();
          console.log(`Cleanup endpoint success: removed ${data.count} requests`);
          return data.count > 0;
        } else {
          console.error(`Cleanup API failed with status ${cleanupResult.status}`);
          return false;
        }
      } catch (error) {
        console.error('Error using cleanup API:', error);
        return false;
      }
    }
    
    console.log(`Found request ID ${request.id} for recipient ${recipientId}, attempting to cancel`);
    try {
      await cancelRequest.mutateAsync(request.id);
      return true;
    } catch (error) {
      console.error(`Failed to cancel request ${request.id}:`, error);
      return false;
    }
  };
  
  const refetchOutgoingRequests = async () => {
    return await refetchOutgoingRequestsInternal();
  };

  return {
    requests,
    isLoadingRequests,
    friends,
    isLoadingFriends,
    sendRequest: sendRequest.mutateAsync,
    handleRequest: handleRequest.mutateAsync,
    outgoingRequests,
    isLoadingOutgoingRequests,
    isOutgoingRequestsError,
    removeFriend: removeFriend.mutateAsync,
    cancelRequest: cancelRequest.mutateAsync,
    cancelRequestByRecipientId, // Add the recipient ID-based cancellation function
    refetchOutgoingRequests // Make the refetch function available
  };
}