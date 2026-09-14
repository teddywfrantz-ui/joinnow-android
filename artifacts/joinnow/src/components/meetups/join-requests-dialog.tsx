import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Check, X } from "lucide-react";
import { useJoinRequests } from "@/hooks/use-join-requests";
import { usePendingRequests } from "@/hooks/use-pending-requests";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { ProfileAvatar } from "@/components/common/profile-avatar";

interface JoinRequestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConfirmAction = {
  requestId: number;
  meetupId: number;
  action: 'accept' | 'reject';
} | null;

export function JoinRequestsDialog({ open, onOpenChange }: JoinRequestsDialogProps) {
  const { pendingRequests, isLoading } = usePendingRequests();
  const { handleRequest } = useJoinRequests();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const handleConfirm = async () => {
    if (!confirmAction) return;

    await handleRequest({
      requestId: confirmAction.requestId,
      meetupId: confirmAction.meetupId,
      status: confirmAction.action === 'accept' ? 'accepted' : 'rejected'
    });

    setConfirmAction(null);
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join Requests</DialogTitle>
          <DialogDescription>
            Review and manage pending join requests
          </DialogDescription>
        </DialogHeader>
        {!pendingRequests || pendingRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No pending requests
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-start justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-start gap-3">
                    <ProfileAvatar
                      profilePicture={request.profilePicture}
                      username={request.username || ''}
                      className="h-9 w-9"
                      size="md"
                    />
                    <div>
                      <div className="font-medium">{request.username}</div>
                      <div className="text-sm text-muted-foreground">
                        For Meet: {request.meetup_title}
                      </div>
                      <div className="text-sm text-foreground/80 mt-1">
                        "{request.message || "No message provided"}"
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Requested {formatDistanceToNow(new Date(request.createdAt!), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => setConfirmAction({
                        requestId: request.id,
                        meetupId: request.meetup_id,
                        action: 'reject'
                      })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setConfirmAction({
                        requestId: request.id,
                        meetupId: request.meetup_id,
                        action: 'accept'
                      })}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>

      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.action === 'accept' ? 'Accept Request' : 'Reject Request'}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {confirmAction?.action === 'accept' ? 'accept' : 'reject'} this join request?
              {confirmAction?.action === 'reject' && " This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction?.action === 'accept' ? 'default' : 'destructive'}
              onClick={handleConfirm}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}