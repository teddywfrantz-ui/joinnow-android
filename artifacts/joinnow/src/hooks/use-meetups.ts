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
        throw new Error('Failed to fetch meetups');
      }
      return response.json();
    },
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
    refetchOnMount: true,
    retry: 3,
    onError: (error: Error) => {
      console.error('Error fetching meetups:', error);
      toast({
        title: "Error fetching meetups",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const createMeetup = useMutation({
    mutationFn: async (meetup: NewMeetup) => {
      const res = await fetch('/api/meetups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...meetup,
          expiresAt: meetup.expiresAt.toISOString()
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

      const errorMessage = data.error || (res.ok ? 
        'Server returned success but no meetup was created' : 
        'Failed to create meetup');
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
        description: "Your meetup has been created successfully.",
      });
    },
    onError: (error: Error) => {
      if (error.message && 
          !error.message.includes('Failed to create meetup') &&
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