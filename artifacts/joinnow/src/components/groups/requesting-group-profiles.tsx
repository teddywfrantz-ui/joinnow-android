import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RequestingGroupProfileRequest = {
  meetupId: number;
  requestId: number;
};

type RequestingGroupProfile = {
  requestId: number;
  group: { id: number; name: string };
  members: Array<{
    userId: number;
    username: string;
    displayName?: string | null;
    bio?: string | null;
    meetsAttendedCount?: number | null;
    role: string;
  }>;
};

export function RequestingGroupProfiles({
  request,
  onClose,
}: {
  request: RequestingGroupProfileRequest | null;
  onClose: () => void;
}) {
  const profileQuery = useQuery({
    queryKey: [
      "/api/meetups",
      request?.meetupId,
      "group-requests",
      request?.requestId,
      "profiles",
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/meetups/${request?.meetupId}/group-requests/${request?.requestId}/profiles`,
        { credentials: "include" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to load group profiles");
      }
      return data as RequestingGroupProfile;
    },
    enabled: Boolean(request),
  });

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Requesting group profiles</DialogTitle>
        </DialogHeader>
        {profileQuery.isLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : profileQuery.data ? (
          <div className="space-y-3">
            <p className="font-medium">{profileQuery.data.group.name}</p>
            {profileQuery.data.members.map((member) => (
              <div key={member.userId} className="rounded border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    {member.displayName || member.username}
                  </p>
                  <Badge variant="outline">{member.role}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  @{member.username}
                </p>
                <p className="mt-1 text-sm">{member.bio || "No bio yet."}</p>
                <p className="text-xs text-muted-foreground">
                  {member.meetsAttendedCount || 0} meets attended
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Requesting group profiles are unavailable.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}