import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, ThumbsUp, ThumbsDown, Loader2, Users, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import cn from 'classnames';

interface RatingFormData {
  [userId: number]: {
    traits: { name: string; endorsement: 1 }[];
  };
}

interface UserTraits {
  traitName: string;
  traitCategory: string;
  endorsements: number;
  totalVotes?: number;
  endorsers: string[];
}

interface PendingEndorsements {
  [key: string]: { // key is userId_traitName
    endorsement: 1 | -1;  // 1 for thumbs up, -1 for thumbs down
  };
}

export default function RateParticipantsPage() {
  const queryClient = useQueryClient();
  const { meetupId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const [ratings, setRatings] = useState<RatingFormData>({});
  const [newTraits, setNewTraits] = useState<{ [key: number]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ratedParticipants, setRatedParticipants] = useState<Set<number>>(new Set());
  const [pendingEndorsements, setPendingEndorsements] = useState<PendingEndorsements>({});

  // First fetch meetup data to know the creator_id
  const { data: meetupData } = useQuery({
    queryKey: [`/api/meetups/${meetupId}`],
    queryFn: async () => {
      if (!meetupId) {
        console.log("No meetupId provided - cannot fetch meetup data");
        return null;
      }
      
      console.log(`Fetching meetup data for meetup ${meetupId}`);
      const res = await fetch(`/api/meetups/${meetupId}`, {
        credentials: 'include'
      });
      
      if (!res.ok) {
        console.error(`Error fetching meetup data: ${res.status} ${res.statusText}`);
        throw new Error(await res.text());
      }
      
      const data = await res.json();
      console.log("Meetup data retrieved:", data);
      return data;
    },
    enabled: Boolean(meetupId)
  });

  // Log some debug info to help troubleshoot
  console.log("Current user:", user);
  console.log("Meetup data:", meetupData);

  const { data: participants = [], isLoading: isParticipantsLoading } = useQuery({
    queryKey: [`/api/meetups/${meetupId}/participants`, 'for=rating'],
    queryFn: async () => {
      if (!user) {
        console.log("No user logged in - returning empty participants list");
        return [];
      }

      console.log(`Fetching participants for meetup ${meetupId} for rating, user: ${user.username} (${user.id})`);
      
      const res = await fetch(`/api/meetups/${meetupId}/participants?for=rating`, {
        credentials: 'include'
      });

      if (!res.ok) {
        console.error(`Error fetching participants: ${res.status} ${res.statusText}`);
        throw new Error(await res.text());
      }
      
      const data = await res.json();

      console.log("All participants before filtering:", data);
      console.log("Participants data type:", typeof data);
      console.log("Is data array?", Array.isArray(data));
      console.log("Data length:", data.length);

      // Filter participants based on the rules:
      // 1. Creator shouldn't see creator in ratings
      // 2. Creator should see participants
      // 3. Participants should see creator
      // 4. Participant shouldn't see himself
      // 5. Participant should see other participants

      const currentUserId = Number(user.id);

      // Get the meetup creator ID
      const creatorId = meetupData?.creator_id;
      console.log(`Current user ID: ${currentUserId}, Creator ID: ${creatorId}`);
      
      // Trust the server-side filtering
      const filteredParticipants = data.filter((p: any) => {
        console.log(`Checking participant: ${p.username} (${p.id}), isRated: ${ratedParticipants.has(Number(p.id))}`);
        const isRated = ratedParticipants.has(Number(p.id));
        if (isRated) {
          console.log(`Filtering out already rated participant (${p.username})`);
          return false;
        }
        console.log(`Including participant ${p.username} for rating`);
        return true;
      });

      console.log("Filtered participants:", filteredParticipants);
      console.log("Filtered participants count:", filteredParticipants.length);
      return filteredParticipants;
    },
    enabled: Boolean(meetupId && user?.id),
    refetchInterval: false // Prevent auto-refetching which could reset filters
  });

  // Get all participants' traits in one query
  const { data: participantTraits = {} } = useQuery({
    queryKey: ['/api/users', 'traits', participants?.map((p: { id: number }) => p.id)],
    queryFn: async () => {
      if (!participants?.length) return {};

      const traitPromises = participants.map(async (participant: { id: number; username: string }) => {
        const res = await fetch(`/api/users/${participant.id}/traits`);
        if (!res.ok) throw new Error(await res.text());
        const traits = await res.json();
        return [participant.id, traits];
      });

      const traitResults = await Promise.all(traitPromises);
      return Object.fromEntries(traitResults);
    },
    enabled: Boolean(participants?.length)
  });

  const submitRatingsMutation = useMutation({
    mutationFn: async () => {
      const allPromises = Object.entries(pendingEndorsements).map(([key, value]) => {
        const [userId, traitName] = key.split('_');
        return fetch(`/api/meetups/${meetupId}/users/${userId}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            trait_name: traitName,
            endorsement: value.endorsement
          })
        }).then(async res => {
          if (!res.ok) {
            const error = await res.text();
            throw new Error(error);
          }
          return res.json();
        });
      });

      // Also submit any new traits
      Object.entries(ratings).forEach(([userId, userRating]) => {
        userRating.traits.forEach((trait: { name: string; endorsement: 1 }) => {
          allPromises.push(
            fetch(`/api/meetups/${meetupId}/users/${userId}/rate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                trait_name: trait.name,
                endorsement: trait.endorsement
              })
            }).then(async res => {
              if (!res.ok) {
                const error = await res.text();
                throw new Error(error);
              }
              return res.json();
            })
          );
        });
      });

      await Promise.all(allPromises);
    },
    onSuccess: () => {
      toast({
        title: "Ratings submitted",
        description: "Thank you for rating the participants!"
      });

      // Clear all state
      setRatings({});
      setPendingEndorsements({});
      setNewTraits({});

      // Add all participants to rated set
      setRatedParticipants(new Set(participants.map((p: any) => p.id)));

      // Invalidate all relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', 'traits'] });
      // Invalidate specific user trait queries
      participants.forEach((participant: any) => {
        queryClient.invalidateQueries({
          queryKey: ['/api/users', participant.id, 'traits']
        });
      });

      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit ratings",
        description: error.message,
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  });

  const handleAddTrait = (userId: number, endorsementValue: 1 = 1) => {
    const traitText = newTraits[userId]?.trim();
    if (!traitText) return;

    // Check if trait has more than 2 words
    const wordCount = traitText.split(/\s+/).length;
    if (wordCount > 2) {
      toast({
        title: "Invalid trait format",
        description: "Traits should be 1-2 words only (e.g., 'Punctual' or 'Team Player')",
        variant: "destructive"
      });
      return;
    }

    // Check if user has already added 3 traits
    const currentTraits = ratings[userId]?.traits || [];
    if (currentTraits.length >= 3) {
      toast({
        title: "Trait limit reached",
        description: "You can only add up to 3 traits per participant.",
        variant: "destructive"
      });
      return;
    }

    // Check if this trait already exists in the existing traits
    const existingTraits = participantTraits[userId] || [];
    const existingTrait = existingTraits.find((t: UserTraits) =>
      t.traitName.toLowerCase() === traitText.toLowerCase()
    );

    if (existingTrait) {
      toast({
        title: "Trait already exists",
        description: "This trait already exists for this participant.",
        variant: "destructive"
      });
      return;
    }

    // Check if this trait is already in the ratings
    const existingRating = ratings[userId]?.traits.find((t: { name: string; endorsement: 1 }) =>
      t.name.toLowerCase() === traitText.toLowerCase()
    );

    if (existingRating) {
      toast({
        title: "Trait already added",
        description: "You've already added this trait for rating.",
        variant: "destructive"
      });
      return;
    }

    setRatings(prev => ({
      ...prev,
      [userId]: {
        traits: [
          ...(prev[userId]?.traits || []),
          { name: traitText, endorsement: endorsementValue }
        ]
      }
    }));

    setNewTraits(prev => ({
      ...prev,
      [userId]: ""
    }));
  };

  const handleEndorsement = (userId: number, traitName: string, value: 1 | -1) => {
    const traitKey = `${userId}_${traitName}`;
    const currentEndorsement = pendingEndorsements[traitKey];

    // If clicking the same button again, remove the endorsement
    if (currentEndorsement?.endorsement === value) {
      setPendingEndorsements(prev => {
        const newEndorsements = { ...prev };
        delete newEndorsements[traitKey];
        return newEndorsements;
      });
      return;
    }

    // Set or update the endorsement
    setPendingEndorsements(prev => ({
      ...prev,
      [traitKey]: {
        endorsement: value
      }
    }));
  };

  const handleSubmitAllRatings = async () => {
    const hasAnyRatings = Object.keys(pendingEndorsements).length > 0 || Object.keys(ratings).length > 0;

    if (!hasAnyRatings) {
      toast({
        title: "No ratings to submit",
        description: "Please add at least one rating before submitting",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    await submitRatingsMutation.mutate();
  };

  if (isParticipantsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading participants...</p>
        </div>
      </div>
    );
  }

  // Filter out rated participants from the remaining list
  const remainingParticipants = participants.filter((p: any) => !ratedParticipants.has(p.id));
  const hasParticipants = remainingParticipants.length > 0;

  if (!hasParticipants) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Rate Participants</h1>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">
            {participants.length > 0 ? "You've rated all participants!" : "No other participants to rate"}
          </p>
          <Button variant="outline" onClick={() => setLocation("/")} className="gap-2">
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Rate Participants</h1>
      <p className="text-muted-foreground">
        Rate each participant by adding positive traits that highlight their strengths and contributions. 
        For existing traits, you can upvote or downvote to adjust their ratings.
      </p>

      <div className="space-y-6">
        {remainingParticipants.map((participant: any) => {
          const existingTraits = participantTraits[participant.id] || [];
          const addedTraits = ratings[participant.id]?.traits || [];
          const remainingTraits = 3 - addedTraits.length;

          return (
            <Card key={participant.id} className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    {participant.username}
                    {participant.id === meetupData?.creator_id && (
                      <Badge variant="outline" className="bg-primary/10">Creator</Badge>
                    )}
                  </h2>
                </div>

                <div className="space-y-4">
                  {existingTraits.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium">Existing Traits</h3>
                      <div className="flex flex-wrap gap-2">
                        {existingTraits.map((trait: UserTraits) => {
                          const traitKey = `${participant.id}_${trait.traitName}`;
                          const pendingEndorsement = pendingEndorsements[traitKey];
                          // Fix: For negative endorsements, we should subtract from the count
                          // This ensures thumbs-down actually reduces the displayed count
                          const displayCount = trait.endorsements + (pendingEndorsement ? pendingEndorsement.endorsement : 0);

                          return (
                            <Badge key={trait.traitName} variant="secondary" className="flex items-center gap-2">
                              {trait.traitName}
                              <Badge 
                                variant="outline" 
                                className="ml-2 text-xs"
                              >
                                {displayCount}
                                {trait.totalVotes && trait.totalVotes !== trait.endorsements && (
                                  <span className="text-muted-foreground text-xs ml-1">({trait.totalVotes} ratings)</span>
                                )}
                              </Badge>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  className={cn(
                                    "h-7 w-7 p-0",
                                    pendingEndorsement?.endorsement === 1 ? "text-primary" : ""
                                  )}
                                  onClick={() => handleEndorsement(participant.id, trait.traitName, 1)}
                                >
                                  <ThumbsUp className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  className={cn(
                                    "h-7 w-7 p-0",
                                    pendingEndorsement?.endorsement === -1 ? "text-destructive" : ""
                                  )}
                                  onClick={() => handleEndorsement(participant.id, trait.traitName, -1)}
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                </Button>
                              </div>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Add New Traits</h3>
                      <Badge variant="outline">
                        {remainingTraits} trait{remainingTraits !== 1 ? 's' : ''} remaining
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter a trait (e.g., Punctual, Friendly)"
                        value={newTraits[participant.id] || ""}
                        onChange={(e) => setNewTraits(prev => ({
                          ...prev,
                          [participant.id]: e.target.value
                        }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTrait(participant.id, 1)}
                        disabled={remainingTraits === 0}
                      />
                      <Button
                        onClick={() => handleAddTrait(participant.id, 1)}
                        disabled={remainingTraits === 0}
                        title="Add trait"
                        className="bg-primary hover:bg-primary/90"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {ratings[participant.id]?.traits?.map((trait, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-2">
                        {trait.name}
                        <Badge 
                          variant="outline" 
                          className="ml-2 text-xs"
                        >
                          {trait.endorsement}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 hover:text-destructive"
                            onClick={() => {
                              setRatings(prev => {
                                const newRatings = { ...prev };
                                if (newRatings[participant.id]) {
                                  newRatings[participant.id].traits = newRatings[participant.id].traits.filter(
                                    t => t.name !== trait.name
                                  );
                                }
                                return newRatings;
                              });
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end gap-4 sticky bottom-4 bg-background p-4 border rounded-lg shadow-lg">
        <Button variant="outline" onClick={() => setLocation("/")} className="gap-2">
          Return Home
        </Button>
        <Button
          onClick={handleSubmitAllRatings}
          disabled={isSubmitting}
          className="gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit All Ratings'
          )}
        </Button>
      </div>
    </div>
  );
}