import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Loader2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GroupMember {
  id: number;
  userId: number;
  username: string;
  displayName?: string | null;
  profilePicture?: string | null;
  role: "leader" | "member";
}

interface GroupMemberProfile {
  id: number;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  profilePicture?: string | null;
  meetsAttendedCount?: number | null;
}

export function GroupMembersDialog({
  groupId,
  groupName,
  open,
  onOpenChange,
}: {
  groupId: number | null | undefined;
  groupName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const membersQuery = useQuery<GroupMember[]>({
    queryKey: [`/api/groups/${groupId}/members`],
    queryFn: async () => {
      const response = await fetch(`/api/groups/${groupId}/members`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to load group members");
      return payload as GroupMember[];
    },
    enabled: open && Boolean(groupId),
    staleTime: 0,
  });
  const profileQuery = useQuery<GroupMemberProfile>({
    queryKey: [
      `/api/groups/${groupId}/members/${selectedUserId}/profile`,
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/groups/${groupId}/members/${selectedUserId}/profile`,
        { credentials: "include" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load member profile");
      }
      return payload as GroupMemberProfile;
    },
    enabled: open && selectedUserId !== null && Boolean(groupId),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Users className="mr-2 inline h-4 w-4" />
              {groupName || "Group"} members
            </DialogTitle>
          </DialogHeader>
          {membersQuery.isLoading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : membersQuery.isError ? (
            <p className="text-sm text-destructive">
              {membersQuery.error instanceof Error
                ? membersQuery.error.message
                : "Unable to load group members"}
            </p>
          ) : membersQuery.data?.length ? (
            <div className="space-y-2">
              {membersQuery.data.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-accent"
                  onClick={() => setSelectedUserId(member.userId)}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={member.profilePicture || undefined} />
                    <AvatarFallback>
                      {(member.displayName || member.username)
                        .slice(0, 1)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {member.displayName || member.username}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{member.username}
                    </span>
                  </span>
                  {member.role === "leader" && (
                    <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label="Group leader" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No group members found.</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={selectedUserId !== null}
        onOpenChange={(nextOpen) => !nextOpen && setSelectedUserId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Member profile</DialogTitle>
          </DialogHeader>
          {profileQuery.isLoading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : profileQuery.isError ? (
            <p className="text-sm text-destructive">
              {profileQuery.error instanceof Error
                ? profileQuery.error.message
                : "Unable to load member profile"}
            </p>
          ) : profileQuery.data ? (
            <div className="space-y-3">
              <div>
                <p className="text-lg font-semibold">
                  {profileQuery.data.displayName ||
                    profileQuery.data.username}
                </p>
                <p className="text-sm text-muted-foreground">
                  @{profileQuery.data.username}
                </p>
              </div>
              <p className="text-sm">
                {profileQuery.data.bio || "No bio yet."}
              </p>
              <p className="text-sm text-muted-foreground">
                {profileQuery.data.meetsAttendedCount || 0} meets attended
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Member profile unavailable.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}