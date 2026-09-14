import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Check,
  ChevronRight,
  ChevronDown,
  Edit3,
  Eye,
  Loader2,
  LogOut,
  Plus,
  Send,
  Shield,
  Trash2,
  UserPlus,
  X,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useJoinRequests } from "@/hooks/use-join-requests";
import { UserProfileModal } from "@/components/users/user-profile-modal";
import {
  type CurrentGroup,
  type GroupMember,
  useGroups,
} from "@/hooks/use-groups";
import { RequestingGroupProfiles } from "@/components/groups/requesting-group-profiles";
import { GroupChat } from "@/components/groups/group-chat";
import { GroupMembersDialog } from "@/components/groups/group-members-dialog";

type Profile = {
  id: number;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  profilePicture?: string | null;
  meetsAttendedCount?: number | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Unable to load data");
  return data as T;
}

function ActionButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button {...props} disabled={pending || props.disabled}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

function InvitationList() {
  const { invitations, currentGroup, respondInvitation } = useGroups();
  const [switchInvitationId, setSwitchInvitationId] = useState<number | null>(
    null,
  );
  if (!invitations.length) return null;
  return (
    <>
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base">Group invitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{invitation.groupName}</p>
                <p className="text-sm text-muted-foreground">
                  Invited by{" "}
                  {invitation.inviterDisplayName || invitation.inviterUsername}
                </p>
              </div>
              <div className="flex gap-2">
                <ActionButton
                  size="sm"
                  onClick={() =>
                    currentGroup
                      ? setSwitchInvitationId(invitation.id)
                      : respondInvitation({
                          invitationId: invitation.id,
                          status: "accepted",
                        })
                  }
                >
                  <Check className="mr-1 h-4 w-4" /> Accept
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    respondInvitation({
                      invitationId: invitation.id,
                      status: "declined",
                    })
                  }
                >
                  Decline
                </ActionButton>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Dialog
        open={switchInvitationId !== null}
        onOpenChange={(open) => !open && setSwitchInvitationId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave your current group?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Accepting this invitation will leave{" "}
            <span className="font-medium text-foreground">
              {currentGroup?.name}
            </span>{" "}
            and switch you to the invited group. Any active group meetup
            participation for you will be detached. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setSwitchInvitationId(null)}
            >
              Keep current group
            </Button>
            <ActionButton
              onClick={async () => {
                if (switchInvitationId === null) return;
                await respondInvitation({
                  invitationId: switchInvitationId,
                  status: "accepted",
                  confirmSwitch: true,
                });
                setSwitchInvitationId(null);
              }}
            >
              Leave and accept
            </ActionButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateGroup({ onCreated }: { onCreated: () => void }) {
  const { createGroup } = useGroups();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      await createGroup({ name: name.trim() });
      setName("");
      toast({
        title: "Group created",
        description: "Invite friends whenever you are ready.",
      });
      onCreated();
    } catch {
      // The hook displays the server error.
    } finally {
      setPending(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a group</CardTitle>
        <p className="text-sm text-muted-foreground">
          Start a group before choosing a meetup. You can invite friends now or
          request another group&apos;s meetup later.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Group name"
            maxLength={80}
            aria-label="Group name"
          />
          <ActionButton type="submit" pending={pending} disabled={!name.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Create group
          </ActionButton>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberProfile({
  groupId,
  member,
  onClose,
}: {
  groupId: number;
  member: GroupMember | null;
  onClose: () => void;
}) {
  const profileQuery = useQuery({
    queryKey: ["/api/groups", groupId, "members", member?.userId, "profile"],
    queryFn: () =>
      fetchJson<Profile>(
        `/api/groups/${groupId}/members/${member?.userId}/profile`,
      ),
    enabled: Boolean(member),
  });
  return (
    <Dialog open={Boolean(member)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Member profile</DialogTitle>
        </DialogHeader>
        {profileQuery.isLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : profileQuery.data ? (
          <div className="space-y-3">
            <div>
              <p className="text-lg font-semibold">
                {profileQuery.data.displayName || profileQuery.data.username}
              </p>
              <p className="text-sm text-muted-foreground">
                @{profileQuery.data.username}
              </p>
            </div>
            <p className="text-sm">{profileQuery.data.bio || "No bio yet."}</p>
            <p className="text-sm text-muted-foreground">
              {profileQuery.data.meetsAttendedCount || 0} meets attended
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Profile unavailable.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GroupMeetupCreator({ group }: { group: CurrentGroup }) {
  const [, setLocation] = useLocation();
  return (
    <ActionButton
      className="w-full"
      onClick={() =>
        setLocation(
          `/map?createMeetup=1&groupId=${encodeURIComponent(group.id)}`,
        )
      }
    >
      <Plus className="mr-1 h-4 w-4" /> Create Meet for group
    </ActionButton>
  );
}

function EmptyGroupState() {
  const [, setLocation] = useLocation();
  return (
    <div className="space-y-4">
      <InvitationList />
      <CreateGroup onCreated={() => setLocation("/groups")} />
      <p className="text-center text-sm text-muted-foreground">
        You can only belong to one group at a time. Leaving a group makes it
        possible to accept a new invitation.
      </p>
    </div>
  );
}

function GroupDetails({ group }: { group: CurrentGroup }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const {
    updateGroup,
    disbandGroup,
    inviteMember,
    removeMember,
    leaveGroup,
    leaveGroupMeetup,
    cancelMeetupRequest,
    decideMeetupRequest,
  } = useGroups();
  const [name, setName] = useState(group.name);
  const [editing, setEditing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(
    null,
  );
  const [selectedRequest, setSelectedRequest] = useState<{
    meetupId: number;
    requestId: number;
  } | null>(null);
  const [selectedJoinUserId, setSelectedJoinUserId] = useState<number | null>(
    null,
  );
  const [selectedFriend, setSelectedFriend] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<GroupMember | null>(
    null,
  );
  const [actionPending, setActionPending] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const friendsQuery = useQuery({
    queryKey: ["/api/friends"],
    queryFn: () =>
      fetchJson<Array<{ id: number; username: string; displayName?: string }>>(
        "/api/friends",
      ),
    enabled: group.viewerRole === "leader" && !group.locked,
  });
  const hostedMeetupId =
    group.currentMeetup?.groupId === group.id
      ? group.currentMeetup.id
      : undefined;
  const hasGroupRequests =
    Boolean(hostedMeetupId && group.viewerRole === "leader") ||
    group.inboundMeetupRequests.length > 0;
  const requestCount =
    (hostedMeetupId && group.viewerRole === "leader"
      ? individualRequests.length
      : 0) + group.inboundMeetupRequests.length;
  const {
    requests: individualRequests = [],
    isLoadingRequests: individualRequestsLoading,
    handleRequest,
  } = useJoinRequests(hostedMeetupId);

  useEffect(() => setName(group.name), [group.name]);
  const run = async (callback: () => Promise<unknown>) => {
    setActionPending(true);
    try {
      await callback();
    } finally {
      setActionPending(false);
    }
  };
  const saveName = () =>
    run(async () => {
      await updateGroup({ groupId: group.id, name });
      setEditing(false);
    });
  const invite = () => {
    if (!selectedFriend) return;
    run(() =>
      inviteMember({ groupId: group.id, userId: Number(selectedFriend) }),
    );
    setSelectedFriend("");
  };
  const confirmRemoveMember = () => {
    if (!memberToRemove) return;
    run(async () => {
      await removeMember({
        groupId: group.id,
        memberId: memberToRemove.userId,
      });
      setMemberToRemove(null);
    });
  };
  const disband = () => {
    if (confirmText !== group.name) return;
    run(async () => {
      await disbandGroup(group.id);
      toast({ title: "Group disbanded" });
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => setShowGroupMembers(true)}
                >
                  {group.name}
                </button>
              </CardTitle>
              <Badge variant="outline">
                {group.viewerRole === "leader" ? "Leader" : "Member"}
              </Badge>
              {group.locked && (
                <Badge variant="secondary">
                  {hostedMeetupId ? "Hosting meetup" : "Joined meetup"}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.members.length} member
              {group.members.length === 1 ? "" : "s"} ·{" "}
              {group.locked
                ? "New members are no longer accepted"
                : "Invite friends or find a meetup"}
            </p>
          </div>
          {group.viewerRole === "leader" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing((value) => !value)}
              >
                <Edit3 className="mr-1 h-4 w-4" /> Edit
              </Button>
            </div>
          )}
        </CardHeader>
        {editing && (
          <CardContent className="border-t pt-4">
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
              <ActionButton pending={actionPending} onClick={saveName}>
                Save
              </ActionButton>
            </div>
          </CardContent>
        )}
      </Card>

      {group.currentMeetup ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              {hostedMeetupId ? "Hosting meetup" : "Joined meetup"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{group.currentMeetup.title}</p>
              <p className="text-sm text-muted-foreground">
                {group.currentMeetup.theme} · capacity{" "}
                {group.currentMeetup.maxParticipants}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setLocation("/active-meet")}>
                Open active meetup <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              {!hostedMeetupId && group.viewerRole === "leader" && (
                <ActionButton
                  variant="outline"
                  pending={actionPending}
                  onClick={() =>
                    run(async () => {
                      await leaveGroupMeetup(group.id);
                      toast({
                        title: "Group left meetup",
                        description:
                          "Your group is still intact and its chat history is preserved.",
                      });
                    })
                  }
                >
                  <LogOut className="mr-1 h-4 w-4" /> Leave meetup
                </ActionButton>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Plan your next Meet</CardTitle>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Create a Meet for your group or browse available Meets.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              {group.viewerRole === "leader" && (
                <div className="flex-1">
                  <GroupMeetupCreator group={group} />
                </div>
              )}
              <Button
                className="w-full sm:flex-1"
                variant="outline"
                onClick={() => setLocation("/map")}
              >
                <Send className="mr-1 h-4 w-4" /> Browse Meets
              </Button>
            </div>
            {group.pendingMeetupRequests.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">Pending Meet requests</p>
                {group.pendingMeetupRequests.map((requestItem) => (
                  <div
                    key={requestItem.id}
                    className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
                  >
                    <span>{requestItem.meetupTitle}</span>
                    {(group.viewerRole === "leader" ||
                      requestItem.requesterId === user?.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          cancelMeetupRequest({
                            groupId: group.id,
                            requestId: requestItem.id,
                          })
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="flex items-center justify-between gap-3 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <MessageSquare className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h3 className="truncate font-medium text-primary">
                Group messages
              </h3>
              <p className="hidden text-sm text-muted-foreground sm:block">
                Your permanent group conversation
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setLocation("/messages?chat=group")}
            className="shrink-0 shadow-sm"
          >
            Open
          </Button>
        </CardContent>
      </Card>

      <Accordion
        type="multiple"
        defaultValue={hasGroupRequests ? ["requests"] : []}
        className="space-y-3"
      >
        {hasGroupRequests && (
          <AccordionItem
            value="requests"
            className="rounded-lg border bg-card px-4"
          >
            <AccordionTrigger className="py-4 hover:no-underline">
              <span className="flex items-center gap-2">
                Requests
                {requestCount > 0 && (
                  <Badge variant="secondary">{requestCount}</Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4">
      {hostedMeetupId && group.viewerRole === "leader" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Individual join requests
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Review people asking to join your group&apos;s meetup.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {individualRequestsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : individualRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending individual requests.
              </p>
            ) : (
              individualRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
                >
                  <button
                    type="button"
                    className="min-w-0 text-left hover:underline"
                    onClick={() => setSelectedJoinUserId(request.user_id)}
                  >
                    <p className="truncate font-medium">
                      {request.displayName ||
                        request.username ||
                        `User ${request.user_id}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {request.username
                        ? `@${request.username}`
                        : "View profile"}
                    </p>
                    {request.message && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {request.message}
                      </p>
                    )}
                  </button>
                  <div className="flex gap-2">
                    <ActionButton
                      size="sm"
                      variant="outline"
                      pending={actionPending}
                      onClick={() =>
                        run(() =>
                          handleRequest({
                            requestId: request.id,
                            meetupId: hostedMeetupId,
                            status: "rejected",
                          }),
                        )
                      }
                    >
                      <X className="mr-1 h-4 w-4" /> Reject
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      pending={actionPending}
                      onClick={() =>
                        run(() =>
                          handleRequest({
                            requestId: request.id,
                            meetupId: hostedMeetupId,
                            status: "accepted",
                          }),
                        )
                      }
                    >
                      <Check className="mr-1 h-4 w-4" /> Accept
                    </ActionButton>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        )}

      {group.viewerRole === "leader" &&
        group.inboundMeetupRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Requests for your meetup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.inboundMeetupRequests.map((requestItem) => (
                <div
                  key={requestItem.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {requestItem.requesterGroupName || "Another group"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {requestItem.meetupTitle}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelectedRequest({
                          meetupId: requestItem.meetupId,
                          requestId: requestItem.id,
                        })
                      }
                    >
                      <Eye className="mr-1 h-4 w-4" /> View group
                    </Button>
                    <ActionButton
                      size="sm"
                      pending={actionPending}
                      onClick={() =>
                        run(() =>
                          decideMeetupRequest({
                            meetupId: requestItem.meetupId,
                            requestId: requestItem.id,
                            status: "accepted",
                          }),
                        )
                      }
                    >
                      Accept
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="outline"
                      pending={actionPending}
                      onClick={() =>
                        run(() =>
                          decideMeetupRequest({
                            meetupId: requestItem.meetupId,
                            requestId: requestItem.id,
                            status: "rejected",
                          }),
                        )
                      }
                    >
                      Decline
                    </ActionButton>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
            </AccordionContent>
          </AccordionItem>
        )}

      <AccordionItem
        value="members"
        className="rounded-lg border bg-card px-4"
      >
        <AccordionTrigger className="py-4 hover:no-underline">
          <span className="flex items-center gap-2">
            Members
            <Badge variant="secondary">{group.members.length}</Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-2">
          {group.members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-2 rounded border p-3"
            >
              <button
                className="flex min-w-0 items-center gap-3 text-left hover:underline"
                onClick={() => setSelectedMember(member)}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold">
                  {(member.displayName || member.username)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {member.displayName || member.username}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{member.username}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-2">
                {member.role === "leader" ? (
                  <Badge variant="outline">
                    <Shield className="mr-1 h-3 w-3" /> Leader
                  </Badge>
                ) : group.viewerRole === "leader" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${member.username}`}
                    onClick={() => setMemberToRemove(member)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="manage"
        className="rounded-lg border bg-card px-4"
      >
        <AccordionTrigger className="py-4 hover:no-underline">
          <span className="flex items-center gap-2">
            Manage group
            {group.viewerRole === "leader" && <Badge variant="outline">Leader</Badge>}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-4">
      {group.viewerRole === "leader" && !group.locked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <UserPlus className="mr-2 inline h-4 w-4" />
              Invite a friend
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Only accepted friends can be invited.
            </p>
          </CardHeader>
          <CardContent className="flex gap-2">
            <select
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              value={selectedFriend}
              onChange={(e) => setSelectedFriend(e.target.value)}
              aria-label="Friend to invite"
            >
              <option value="">Select a friend</option>
              {(friendsQuery.data ?? [])
                .filter(
                  (friend) =>
                    !group.members.some(
                      (member) => member.userId === friend.id,
                    ),
                )
                .map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.displayName || friend.username}
                  </option>
                ))}
            </select>
            <ActionButton
              pending={actionPending}
              onClick={invite}
              disabled={!selectedFriend}
            >
              Send invite
            </ActionButton>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          {group.viewerRole === "leader" ? (
            <div className="space-y-2">
              <p className="font-medium">Disband group</p>
              <p className="text-sm text-muted-foreground">
                Type the group name to permanently remove this group. Existing
                meetups remain available.
              </p>
              <div className="flex gap-2">
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={group.name}
                  aria-label="Type group name to disband"
                />
                <ActionButton
                  variant="destructive"
                  pending={actionPending}
                  disabled={confirmText !== group.name}
                  onClick={disband}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Disband
                </ActionButton>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-medium">Leave group</p>
              <p className="text-sm text-muted-foreground">
                Leaving removes you from future group requests and detaches you
                from any active group meetup. You can request meetups
                individually afterward. The group creator must disband instead.
              </p>
              <ActionButton
                className="mt-2"
                variant="destructive"
                pending={actionPending}
                onClick={() => run(() => leaveGroup(group.id))}
              >
                <LogOut className="mr-1 h-4 w-4" /> Leave group
              </ActionButton>
            </div>
          )}
        </CardContent>
      </Card>
        </AccordionContent>
      </AccordionItem>
      </Accordion>

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) =>
          !open && !actionPending && setMemberToRemove(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove
                ? `${memberToRemove.displayName || memberToRemove.username} will be removed from ${group.name}. They will no longer be included in future group meetup requests, will be detached from any active group meetup, and will lose access to the group chat.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>
              Keep member
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionPending}
              onClick={(event) => {
                event.preventDefault();
                confirmRemoveMember();
              }}
            >
              {actionPending ? "Removing…" : "Remove member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberProfile
        groupId={group.id}
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
      <RequestingGroupProfiles
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
      />
      <UserProfileModal
        userId={selectedJoinUserId}
        open={selectedJoinUserId !== null}
        onOpenChange={(open) => !open && setSelectedJoinUserId(null)}
      />
      <GroupMembersDialog
        groupId={group.id}
        groupName={group.name}
        open={showGroupMembers}
        onOpenChange={setShowGroupMembers}
      />
    </div>
  );
}

function GroupScrollHint() {
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(
      "[data-group-scroll-content]",
    );
    const scrollContainer = content?.closest<HTMLElement>("main");
    if (!content || !scrollContainer) return;

    const update = () => {
      const remaining =
        scrollContainer.scrollHeight -
        scrollContainer.clientHeight -
        scrollContainer.scrollTop;
      setHasMoreBelow(remaining > 12);
    };

    update();
    scrollContainer.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(content);

    return () => {
      scrollContainer.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver.disconnect();
    };
  }, []);

  const scrollMore = () => {
    const content = document.querySelector<HTMLElement>(
      "[data-group-scroll-content]",
    );
    const scrollContainer = content?.closest<HTMLElement>("main");
    if (!scrollContainer) return;

    const remaining =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;
    const distance = Math.min(
      remaining,
      Math.max(160, scrollContainer.clientHeight * 0.72),
    );
    scrollContainer.scrollBy({ top: distance, behavior: "smooth" });
  };

  if (!hasMoreBelow) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-20 bg-gradient-to-t from-background via-background/75 to-transparent md:hidden"
    >
      <button
        type="button"
        aria-label="Scroll to see more group options"
        onClick={scrollMore}
        className="pointer-events-auto absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center rounded-full border bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className="mr-1 h-3 w-3 animate-bounce" />
        More below
      </button>
    </div>
  );
}

export function GroupsTab() {
  const { currentGroup, isLoading } = useGroups();
  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  }
  return (
    <div
      className="mx-auto max-w-3xl space-y-5 p-4"
      data-group-scroll-content
    >
      <div>
        <h2 className="text-2xl font-semibold">My group</h2>
        <p className="text-sm text-muted-foreground">
          Build a meetup group with friends, then join the activity that fits
          everyone.
        </p>
      </div>
      {currentGroup ? (
        <>
          <InvitationList />
          <GroupDetails group={currentGroup} />
        </>
      ) : (
        <EmptyGroupState />
      )}
      <GroupScrollHint />
    </div>
  );
}
