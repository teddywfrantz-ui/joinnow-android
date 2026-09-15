import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export interface GroupMember {
  id: number;
  userId: number;
  username: string;
  displayName?: string | null;
  profilePicture?: string | null;
  role: "leader" | "member";
  joinedAt?: string;
}

export interface GroupMeetupRequest {
  id: number;
  groupId: number;
  meetupId: number;
  requesterId: number;
  status: string;
  meetupTitle: string;
  meetupExpiresAt: string;
  receiverGroupId?: number | null;
  groupName?: string;
  requesterGroupName?: string;
  createdAt?: string;
}

export interface CurrentGroup {
  id: number;
  name: string;
  creatorId: number;
  currentMeetupId?: number | null;
  locked: boolean;
  viewerRole: "leader" | "member";
  members: GroupMember[];
  pendingMeetupRequests: GroupMeetupRequest[];
  inboundMeetupRequests: GroupMeetupRequest[];
  invitations: Array<{
    id: number;
    inviteeId: number;
    inviteeUsername: string;
    inviteeDisplayName?: string | null;
  }>;
  currentMeetup?: {
    id: number;
    title: string;
    description: string;
    expiresAt: string;
    maxParticipants: number;
    theme: string;
    groupId?: number | null;
  } | null;
}

export interface GroupInvitation {
  id: number;
  groupId: number;
  groupName: string;
  inviterId: number;
  inviterUsername: string;
  inviterDisplayName?: string | null;
  createdAt?: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed") as Error & {
      details?: Record<string, unknown>;
    };
    error.details = payload;
    throw error;
  }
  return payload as T;
}

export function useGroups() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    queryClient.invalidateQueries({ queryKey: ["/api/group-invitations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user-status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/meetups"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pending-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-pending-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/active-meetup"] });
  };

  const groupsQuery = useQuery<CurrentGroup[]>({
    queryKey: ["/api/groups"],
    queryFn: () => requestJson<CurrentGroup[]>("/api/groups"),
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 10000,
  });
  const invitationsQuery = useQuery<GroupInvitation[]>({
    queryKey: ["/api/group-invitations"],
    queryFn: () => requestJson<GroupInvitation[]>("/api/group-invitations"),
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 10000,
  });

  const useGroupMutation = <T>(fn: (input: T) => Promise<unknown>) =>
    useMutation({
      mutationFn: fn,
      onSuccess: refresh,
      onError: (error: Error) =>
        toast({
          title: "Group action failed",
          description: error.message,
          variant: "destructive",
        }),
    });

  const createGroup = useGroupMutation<{ name: string }>((input) =>
    requestJson("/api/groups", { method: "POST", body: JSON.stringify(input) }),
  );
  const updateGroup = useGroupMutation<{ groupId: number; name: string }>(
    (input) =>
      requestJson(`/api/groups/${input.groupId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: input.name }),
      }),
  );
  const disbandGroup = useGroupMutation<number>((groupId) =>
    requestJson(`/api/groups/${groupId}`, { method: "DELETE" }),
  );
  const inviteMember = useGroupMutation<{ groupId: number; userId: number }>(
    (input) =>
      requestJson(`/api/groups/${input.groupId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ userId: input.userId }),
      }),
  );
  const respondInvitation = useGroupMutation<{
    invitationId: number;
    status: "accepted" | "declined";
    confirmSwitch?: boolean;
  }>((input) =>
    requestJson(`/api/group-invitations/${input.invitationId}`, {
      method: "POST",
      body: JSON.stringify({
        status: input.status,
        ...(input.confirmSwitch ? { confirmSwitch: true } : {}),
      }),
    }),
  );
  const removeMember = useGroupMutation<{ groupId: number; memberId: number }>(
    (input) =>
      requestJson(`/api/groups/${input.groupId}/members/${input.memberId}`, {
        method: "DELETE",
      }),
  );
  const leaveGroup = useGroupMutation<number>((groupId) =>
    requestJson(`/api/groups/${groupId}/leave`, { method: "DELETE" }),
  );
  const leaveGroupMeetup = useGroupMutation<number>((groupId) =>
    requestJson(`/api/groups/${groupId}/leave-meetup`, { method: "POST" }),
  );
  const createGroupMeetup = useGroupMutation<{
    groupId: number;
    [key: string]: unknown;
  }>((input) => {
    const { groupId, ...body } = input;
    return requestJson(`/api/groups/${groupId}/meetups`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  });
  const requestMeetup = useGroupMutation<{ groupId: number; meetupId: number }>(
    (input) =>
      requestJson(`/api/groups/${input.groupId}/meetup-requests`, {
        method: "POST",
        body: JSON.stringify({ meetupId: input.meetupId }),
      }),
  );
  const cancelMeetupRequest = useGroupMutation<{
    groupId: number;
    requestId: number;
  }>((input) =>
    requestJson(
      `/api/groups/${input.groupId}/meetup-requests/${input.requestId}`,
      {
        method: "DELETE",
      },
    ),
  );
  const decideMeetupRequest = useGroupMutation<{
    meetupId: number;
    requestId: number;
    status: "accepted" | "rejected";
  }>((input) =>
    requestJson(
      `/api/meetups/${input.meetupId}/group-requests/${input.requestId}`,
      {
        method: "POST",
        body: JSON.stringify({ status: input.status }),
      },
    ),
  );

  return {
    groups: groupsQuery.data ?? [],
    currentGroup: groupsQuery.data?.[0] ?? null,
    invitations: invitationsQuery.data ?? [],
    isLoading: groupsQuery.isLoading || invitationsQuery.isLoading,
    createGroup: createGroup.mutateAsync,
    updateGroup: updateGroup.mutateAsync,
    disbandGroup: disbandGroup.mutateAsync,
    inviteMember: inviteMember.mutateAsync,
    respondInvitation: respondInvitation.mutateAsync,
    removeMember: removeMember.mutateAsync,
    leaveGroup: leaveGroup.mutateAsync,
    leaveGroupMeetup: leaveGroupMeetup.mutateAsync,
    createGroupMeetup: createGroupMeetup.mutateAsync,
    requestMeetup: requestMeetup.mutateAsync,
    cancelMeetupRequest: cancelMeetupRequest.mutateAsync,
    decideMeetupRequest: decideMeetupRequest.mutateAsync,
  };
}
