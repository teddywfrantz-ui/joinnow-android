import { useQuery } from "@tanstack/react-query";
import type { Meetup } from "@db/schema";
import { useUser } from "./use-user";

interface Participant {
  id: number;
  username: string;
  createdAt: string;
}

export function useActiveMeetup() {
  const { user } = useUser();

  const { data: activeMeetupData, isLoading } = useQuery<{ meetup: Meetup | null, participants: Participant[] }>({
    queryKey: ['/api/user-status', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return { meetup: null, participants: [] };

      // Get user's current status including active meetup
      const statusResponse = await fetch('/api/user-status', {
        credentials: 'include'
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to fetch user status');
      }

      const userStatus = await statusResponse.json();

      // If user has an active meetup, get its details and participants
      if (userStatus.activeMeetupId) {
        const [meetupResponse, participantsResponse] = await Promise.all([
          fetch(`/api/meetups/${userStatus.activeMeetupId}`, {
            credentials: 'include'
          }),
          fetch(`/api/meetups/${userStatus.activeMeetupId}/participants`, {
            credentials: 'include'
          })
        ]);

        if (!meetupResponse.ok || !participantsResponse.ok) {
          throw new Error('Failed to fetch meetup details');
        }

        const meetup = await meetupResponse.json();
        const participants = await participantsResponse.json();
        return { meetup, participants };
      }

      return { meetup: null, participants: [] };
    },
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    cacheTime: 0,
    retry: 3
  });

  return {
    activeMeetup: activeMeetupData?.meetup ?? null,
    participants: activeMeetupData?.participants ?? [],
    isLoading
  };
}