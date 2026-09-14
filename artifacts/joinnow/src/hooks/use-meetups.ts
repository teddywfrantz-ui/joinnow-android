import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NewMeetup } from '@db/schema';
import { useToast } from '@/hooks/use-toast';

export function useMeetups() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: meetups, isLoading } = useQuery({
    queryKey: ['/api/meetups'],
    queryFn: async () => {
      const response = await fetch('/api/meetups', {
        credentials: 'include'
      });
      if (!response.ok) {
  throw new Error('Failed to fetch Meets');
      }
      return response.json();
    },
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
    refetchOnMount: true,
    retry: 3,
    onError: (error: Error) => {
  console.error('Error fetching Meets:', error);
      toast({
    title: "Error fetching Meets",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const createMeetup = useMutation({
    mutationFn: async (
      meetup: NewMeetup & {
        groupId?: number;
        radius?: number;
        duration?: number;
      },
    ) => {
      const { groupId, ...meetupFields } = meetup;
      const endpoint = groupId
        ? `/api/groups/${groupId}/meetups`
        : "/api/meetups";
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...meetupFields,
          expiresAt: meetupFields.expiresAt instanceof Date
            ? meetupFields.expiresAt.toISOString()
            : meetupFields.expiresAt,
        }),
        credentials: 'include'
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error('Invalid server response');
      }

      if (data && data.id) {
        return data;
      }

      const errorMessage = data?.error || (res.ok ?
  'Server returned success but no Meet was created' :
  'Failed to create Meet');
      throw new Error(errorMessage);
    },
    onSuccess: (data) => {
      // Update queries immediately
      queryClient.setQueryData(['/api/active-meetup'], data);

      // Invalidate affected queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          return query.queryKey[0] === '/api/meetups' ||
                 query.queryKey[0] === '/api/pending-requests' ||
                 query.queryKey[0] === '/api/my-pending-requests' ||
                 query.queryKey[0] === '/api/active-meetup';
        }
      });

      toast({
        title: "Success!",
    description: "Your Meet has been created successfully.",
      });
    },
    onError: (error: Error) => {
      if (error.message && 
          !error.message.includes('Failed to create Meet') &&
          !error.message.includes('Invalid server response')) {
        toast({
          title: "Creation Failed",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  });

  return {
    meetups: meetups?.filter(m => new Date(m.expiresAt) > new Date()) || [], // Filter out expired meetups
    isLoading,
    createMeetup: createMeetup.mutateAsync
  };
}