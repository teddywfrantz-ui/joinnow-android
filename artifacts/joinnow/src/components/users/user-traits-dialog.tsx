import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ThumbsUp, Check, X } from "lucide-react";

interface Trait {
  traitId: number;
  traitName: string;
  traitCategory: string;
  endorsements: number;
  totalVotes: number;
  endorsers: string[];
}

interface UserTraitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  username: string;
  requestId?: number;
  onAccept?: (requestId: number) => void;
  onReject?: (requestId: number) => void;
}

function TraitCard({ trait }: { trait: Trait }) {
  const [showRaters, setShowRaters] = useState(false);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{trait.traitName}</h3>
              <Badge variant="secondary">{trait.traitCategory}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="flex items-center gap-1 text-sm text-muted-foreground"
                title="Total interactions"
              >
                <span>{trait.totalVotes || 0}</span>
                <span className="text-xs">ratings</span>
              </div>
              <button 
                onClick={() => setShowRaters(!showRaters)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Net ratings"
              >
                <ThumbsUp className="w-4 h-4" />
                <span>{trait.endorsements}</span> {/* Using existing prop but displaying as ratings */}
              </button>
            </div>
          </div>
          {showRaters && trait.endorsers?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {trait.endorsers.map((rater: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {rater}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function UserTraitsDialog({ 
  open, 
  onOpenChange, 
  userId, 
  username,
  requestId,
  onAccept,
  onReject
}: UserTraitsDialogProps) {
  const { data: traits, isLoading } = useQuery({
    queryKey: ['/api/users', userId, 'traits'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/traits`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open && userId > 0 // Only fetch when dialog is open and userId is valid
  });

  const showActions = requestId && onAccept && onReject;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[425px]"
        aria-describedby="user-traits-description"
      >
        <DialogHeader>
          <DialogTitle>{username}'s Traits</DialogTitle>
          <div id="user-traits-description" className="sr-only">
            View traits that others have recognized in {username}
          </div>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : traits?.length ? (
            (() => {
              // Filter out traits with zero or negative net score
              const userTraits = traits.filter(
                (trait: Trait) => trait.endorsements > 0
              );
              
              return userTraits.length > 0 ? (
                userTraits.map((trait: Trait) => (
                  <TraitCard key={trait.traitId} trait={trait} />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No traits available
                </div>
              );
            })()
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No traits yet
            </div>
          )}
        </div>
        {showActions && (
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="flex-1 gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => {
                onReject(requestId);
                onOpenChange(false);
              }}
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => {
                onAccept(requestId);
                onOpenChange(false);
              }}
            >
              <Check className="h-4 w-4" />
              Accept
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}