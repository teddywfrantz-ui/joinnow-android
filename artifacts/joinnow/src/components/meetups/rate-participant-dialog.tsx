import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { StarIcon, Medal, ThumbsUp, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { User } from "@db/schema";

interface RateParticipantDialogProps {
  participant: User;
  meetupId: number;
  onRated?: () => void;
}

export function RateParticipantDialog({ participant, meetupId, onRated }: RateParticipantDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [traitEndorsements, setTraitEndorsements] = useState<Record<number, 1>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: traits } = useQuery({
    queryKey: ['/api/traits'],
    queryFn: async () => {
      const res = await fetch('/api/traits');
      if (!res.ok) throw new Error(await res.text());
      const traitData = await res.json();
      
      // Add endorsementCount with default 0 if not present
      return traitData.map((trait: any) => ({
        ...trait,
        endorsementCount: trait.endorsementCount || 0
      }));
    }
  });

  const rateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetups/${meetupId}/users/${participant.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rating: 5,
          comment 
        })
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', participant.id, 'ratings'] });
      toast({
        title: "Rating Submitted",
        description: `You rated ${participant.username}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit rating",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const endorseMutation = useMutation({
    mutationFn: async ({ traitId, endorsementValue }: { traitId: number, endorsementValue: 1 }) => {
      const res = await fetch(`/api/users/${participant.id}/traits/${traitId}/endorse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          meetupId,
          endorsementValue // Send the endorsement value to the API
        })
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', participant.id, 'traits'] });
      toast({
        title: "Trait Endorsed",
        description: `Successfully endorsed trait for ${participant.username}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to endorse trait",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleSubmit = async () => {
    try {
      // Submit rating first
      await rateMutation.mutateAsync();

      // Then submit all traits with their endorsement values
      await Promise.all(
        Object.entries(traitEndorsements).map(([traitId, endorsementValue]) => 
          endorseMutation.mutateAsync({ 
            traitId: parseInt(traitId), 
            endorsementValue 
          })
        )
      );

      setIsOpen(false);
      onRated?.();
    } catch (error) {
      console.error('Failed to submit rating and traits:', error);
    }
  };

  const handleEndorsement = (traitId: number, value: 1) => {
    // Get current endorsement value for this trait
    const currentValue = traitEndorsements[traitId];
    
    // If clicking the same button again, remove the endorsement
    if (currentValue === value) {
      setTraitEndorsements(prev => {
        const newEndorsements = { ...prev };
        delete newEndorsements[traitId];
        return newEndorsements;
      });
      return;
    }
    
    // Set or update the endorsement
    setTraitEndorsements(prev => ({
      ...prev,
      [traitId]: value
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <StarIcon className="w-4 h-4 mr-2" />
          Rate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Rate {participant.username}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <label className="font-medium">Comment (Optional)</label>
            <Textarea
              placeholder="Share your experience with this participant..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="font-medium flex items-center gap-2">
              <Medal className="w-4 h-4" />
              Endorse Traits
            </label>
            <ScrollArea className="h-48 rounded-md border">
              <div className="p-4 grid grid-cols-2 gap-2">
                {traits?.map((trait: any) => {
                  const endorsementValue = traitEndorsements[trait.id];
                  const isSelected = endorsementValue === 1;
                  
                  return (
                    <Card
                      key={trait.id}
                      className={cn(
                        "p-2 transition-colors",
                        isSelected ? "border-green-500 bg-green-50/50" : "hover:bg-gray-50/50"
                      )}
                    >
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{trait.name}</div>
                            <Badge variant="secondary" className="text-xs mt-1">
                              {trait.category}
                            </Badge>
                          </div>
                          {isSelected && (
                            <ThumbsUp className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        
                        <div className="flex gap-1 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              "h-8 w-full",
                              isSelected && "bg-green-500 text-white hover:bg-green-600 hover:text-white"
                            )}
                            onClick={() => handleEndorsement(trait.id, 1)}
                          >
                            <ThumbsUp className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}