import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JoinRequest } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect } from "react";

interface Participant {
  id: number;
  username: string;
  createdAt: string;
}

export interface MeetupJoinRequest extends JoinRequest {
  username?: string | null;
  displayName?: string | null;
  profilePicture?: string | null;
}

export function useJoinRequests(meetupId?: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sendMessage, subscribe } = useWebSocket();

  // Subscribe to WebSocket updates
  useEffect(() => {
    if (!meetupId) return;

    console.log("Setting up WebSocket subscription for meetup:", meetupId);

    const unsubscribe = subscribe((message) => {
      console.log("Received WebSocket message in useJoinRequests:", message);

      if (message.meetupId === meetupId) {
        switch (message.type) {
          case "join_request":
            console.log("Received join request update");
            // Invalidate requests and related queries immediately
            queryClient.invalidateQueries({
              queryKey: [`/api/meetups/${meetupId}/requests`],
            });
            queryClient.invalidateQueries({ queryKey: ["/api/meetups"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

            // Force a refetch of requests
            queryClient.refetchQueries({
              queryKey: [`/api/meetups/${meetupId}/requests`],
            });
            break;

          case "request_update":
            console.log("Received request status update");
            // Update all related data immediately
            queryClient.invalidateQueries({ queryKey: ["/api/active-meetup"] });
            queryClient.invalidateQueries({
              queryKey: [`/api/meetups/${meetupId}/participants`],
            });
            queryClient.invalidateQueries({
              queryKey: [`/api/meetups/${meetupId}/requests`],
            });
            queryClient.invalidateQueries({
              queryKey: [`/api/meetups/${meetupId}/my-request`],
            });
            queryClient.invalidateQueries({ queryKey: ["/api/meetups"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

            // Force refetch of critical data
            queryClient.refetchQueries({
              queryKey: [`/api/meetups/${meetupId}/requests`],
            });
            queryClient.refetchQueries({
              queryKey: [`/api/meetups/${meetupId}/my-request`],
            });
            break;

          case "participant_left":
            console.log("Received participant left update");
            queryClient.invalidateQueries({ queryKey: ["/api/active-meetup"] });
            queryClient.invalidateQueries({
              queryKey: [`/api/meetups/${meetupId}/participants`],
            });
            break;
        }
      }
    });

    return () => {
      console.log("Cleaning up WebSocket subscription");
      unsubscribe();
    };
  }, [meetupId, queryClient, subscribe]);

  // Query setup
  const { data: requests, isLoading: isLoadingRequests } = useQuery<
    MeetupJoinRequest[]
  >({
    queryKey: [`/api/meetups/${meetupId}/requests`],
    queryFn: async () => {
      console.log("Fetching requests for meetup:", meetupId);
      const res = await fetch(`/api/meetups/${meetupId}/requests`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      console.log("Received requests:", data);
      return data;
    },
    enabled: !!meetupId,
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
    refetchInterval: 5000, // Polling fallback every 5 seconds
  });

  const { data: participants, isLoading: isLoadingParticipants } = useQuery<
    Participant[]
  >({
    queryKey: [`/api/meetups/${meetupId}/participants`],
    queryFn: async () => {
      const res = await fetch(`/api/meetups/${meetupId}/participants`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!meetupId,
    refetchOnWindowFocus: true,
    staleTime: 0,
    refetchInterval: 5000,
  });

  const { data: pendingRequest } = useQuery<JoinRequest>({
    queryKey: [`/api/meetups/${meetupId}/my-request`],
    queryFn: async () => {
      const res = await fetch(`/api/meetups/${meetupId}/my-request`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(await res.text());
      }
      return res.json();
    },
    enabled: !!meetupId,
    refetchOnWindowFocus: true,
    staleTime: 0,
    refetchInterval: 5000,
  });

  // Mutations
  const sendRequest = useMutation({
    mutationFn: async ({
      meetupId,
      message,
    }: {
      meetupId: number;
      message?: string;
    }) => {
      const res = await fetch(`/api/meetups/${meetupId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message || "I'd like to join your meet!",
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(errorData);
      }

      const responseData = await res.json();
      console.log("Send request response:", responseData);

      // Send WebSocket notification about new request
      sendMessage({
        type: "join_request",
        meetupId,
        userId: responseData.userId,
        requestId: responseData.id,
        message: message || "I'd like to join your meet!",
      });

      return responseData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetups"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/meetups/${meetupId}/my-request`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      // Force refetch
      queryClient.refetchQueries({
        queryKey: [`/api/meetups/${meetupId}/my-request`],
      });

      toast({
        title: "Request sent",
        description: "Your request to join has been sent!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelRequest = async (requestId: number) => {
    if (!meetupId) throw new Error("No meetup ID provided");

    try {
      console.log("Cancelling request:", { requestId, meetupId });

      // Optimistically update UI before the API call
      const previousRequest = queryClient.getQueryData<JoinRequest>([
        `/api/meetups/${meetupId}/my-request`,
      ]);
      const previousRequests = queryClient.getQueryData<JoinRequest[]>([
        `/api/meetups/${meetupId}/requests`,
      ]);

      console.log("Current state before cancel:", {
        previousRequest,
        previousRequests,
        meetupId,
      });

      // Immediately set my-request to null
      queryClient.setQueryData([`/api/meetups/${meetupId}/my-request`], null);

      // Update requests list if it exists
      if (previousRequests) {
        queryClient.setQueryData(
          [`/api/meetups/${meetupId}/requests`],
          previousRequests.filter((r) => r.id !== requestId),
        );
      }

      // Update meetups data to remove pending status
      queryClient.setQueriesData({ queryKey: ["/api/meetups"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((m) =>
          m.id === meetupId
            ? {
                ...m,
                pendingRequestCount: Math.max(
                  0,
                  (m.pendingRequestCount || 0) - 1,
                ),
              }
            : m,
        );
      });

      const res = await fetch(
        `/api/meetups/${meetupId}/requests/${requestId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!res.ok) {
        // Revert optimistic updates on error
        queryClient.setQueryData(
          [`/api/meetups/${meetupId}/my-request`],
          previousRequest,
        );
        if (previousRequests) {
          queryClient.setQueryData(
            [`/api/meetups/${meetupId}/requests`],
            previousRequests,
          );
        }

        const errorText = await res.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error;
        } catch {
          errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      // Force immediate refetch of all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/meetups"] }),
        queryClient.invalidateQueries({
          queryKey: [`/api/meetups/${meetupId}/my-request`],
        }),
        queryClient.invalidateQueries({
          queryKey: [`/api/meetups/${meetupId}/requests`],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/pending-requests"] }),
        queryClient.invalidateQueries({
          queryKey: ["/api/my-pending-requests"],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
      ]);

      // Force immediate refetch
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/meetups"] }),
        queryClient.refetchQueries({
          queryKey: [`/api/meetups/${meetupId}/my-request`],
        }),
        queryClient.refetchQueries({ queryKey: ["/api/pending-requests"] }),
        queryClient.refetchQueries({ queryKey: ["/api/my-pending-requests"] }),
      ]);

      console.log("Request cancelled successfully:", {
        meetupId,
        requestId,
        newMyRequest: queryClient.getQueryData([
          `/api/meetups/${meetupId}/my-request`,
        ]),
      });

      toast({
        title: "Request cancelled",
        description: "Your join request has been cancelled.",
      });
    } catch (error: any) {
      console.error("Error cancelling request:", error);
      toast({
        title: "Failed to cancel request",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleRequest = async ({
    requestId,
    meetupId,
    status,
  }: {
    requestId: number;
    meetupId: number;
    status: "accepted" | "rejected";
  }) => {
    try {
      const res = await fetch(
        `/api/meetups/${meetupId}/requests/${requestId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
          credentials: "include",
        },
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      console.log("Handle request response:", data);

      // Send WebSocket notification about request update
      sendMessage({
        type: "request_update",
        meetupId,
        userId: data.userId,
        requestId,
        status,
        title: status === "accepted" ? "Request Accepted" : "Request Rejected",
        message:
          status === "accepted"
            ? "Your request to join has been accepted!"
            : "Your request to join has been rejected.",
      });

      // Update UI immediately
      queryClient.invalidateQueries({ queryKey: ["/api/active-meetup"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/meetups/${meetupId}/participants`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/meetups/${meetupId}/requests`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/meetups/${meetupId}/my-request`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meetups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      // Force refetch of critical data
      queryClient.refetchQueries({
        queryKey: [`/api/meetups/${meetupId}/requests`],
      });
      queryClient.refetchQueries({
        queryKey: [`/api/meetups/${meetupId}/my-request`],
      });

      toast({
        title: "Request handled",
        description: `Request ${status}!`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Failed to handle request",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const leaveMeetup = async () => {
    if (!meetupId) return;

    try {
      const res = await fetch(`/api/meetups/${meetupId}/leave`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());

      await queryClient.invalidateQueries({ queryKey: ["/api/meetups"] });
      await queryClient.invalidateQueries({
        queryKey: [`/api/meetups/${meetupId}/participants`],
      });
      await queryClient.invalidateQueries({
        queryKey: [`/api/meetups/${meetupId}/my-request`],
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      toast({
      title: "Left Meet",
      description: "You have successfully left the Meet.",
      });
    } catch (error: any) {
      toast({
      title: "Failed to leave Meet",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    requests,
    isLoadingRequests,
    participants,
    isLoadingParticipants,
    pendingRequest,
    isRequestLoading: sendRequest.isPending,
    sendRequest: async (meetupId: number, message?: string) => {
      return sendRequest.mutateAsync({ meetupId, message });
    },
    handleRequest,
    leaveMeetup,
    cancelRequest,
  };
}
