import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JoinRequest } from '@db/schema';
import { useUser } from './use-user';
import { useToast } from '@/hooks/use-toast';

export function usePendingRequests() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pendingRequests, isLoading } = useQuery<JoinRequest[]>({
    queryKey: ['/api/pending-requests', user?.id],
    queryFn: async () => {
      console.log('Fetching pending requests for user:', user?.id);
      if (!user) return [];

      try {
        const res = await fetch('/api/pending-requests', {
          credentials: 'include'
        });

        if (!res.ok) {
          console.error('Pending requests fetch failed:', await res.text());
          return [];
        }

        const data = await res.json();
        console.log('Pending requests API response:', {
          data,
          userId: user.id,
          endpoint: '/api/pending-requests'
        });
        return data;
      } catch (error) {
        console.error('Error fetching pending requests:', error);
        return [];
      }
    },
    enabled: !!user,
    placeholderData: [],
    staleTime: 0, // Don't cache between sessions
    gcTime: 0 // Don't keep stale data between sessions
  });

  const cancelRequest = async (meetupId: number, requestId: number) => {
    if (!user) return;

    try {
      // Optimistically update UI
      const previousRequests = queryClient.getQueryData<JoinRequest[]>(['/api/pending-requests', user.id]) || [];
      const previousMyRequests = queryClient.getQueryData<JoinRequest[]>(['/api/my-pending-requests']) || [];

      console.log('Cancelling request and updating state:', {
        meetupId,
        requestId,
        previousRequests,
        previousMyRequests
      });

      // Cancel all pending requests for this meetup
      await queryClient.cancelQueries({ queryKey: ['/api/meetups', meetupId] });
      await queryClient.cancelQueries({ queryKey: ['/api/pending-requests'] });
      await queryClient.cancelQueries({ queryKey: ['/api/my-pending-requests'] });

      // Update pending requests cache
      queryClient.setQueryData<JoinRequest[]>(['/api/pending-requests', user.id], 
        previousRequests.filter(req => req.id !== requestId)
      );

      // Update my-pending-requests cache
      queryClient.setQueryData<JoinRequest[]>(['/api/my-pending-requests'], 
        previousMyRequests.filter(req => req.id !== requestId)
      );

      // Update meetups data to remove pending request count
      queryClient.setQueriesData({ queryKey: ['/api/meetups'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        console.log('Updating meetups data after cancellation:', { meetupId, old });
        return old.map(meetup => {
          if (meetup.id === meetupId) {
            console.log('Found meetup to update:', meetup);
            return { ...meetup, pendingRequestCount: Math.max(0, (meetup.pendingRequestCount || 0) - 1) };
          }
          return meetup;
        });
      });

      // Make the API call
      const res = await fetch(`/api/meetups/${meetupId}/requests/${requestId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        // Revert optimistic updates on error
        queryClient.setQueryData(['/api/pending-requests', user.id], previousRequests);
        queryClient.setQueryData(['/api/my-pending-requests'], previousMyRequests);

        const errorText = await res.text();
        console.error('Failed to cancel request:', errorText);
        toast({
          title: "Error",
          description: "Failed to cancel request. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Log successful cancellation
      console.log(`Successfully cancelled request ${requestId} for meetup ${meetupId}`);

      // Invalidate ALL queries to ensure data consistency across views
      await Promise.all([
        // Invalidate specific request-related queries
        queryClient.invalidateQueries({ queryKey: ['/api/pending-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/my-pending-requests'] }),
        
        // Invalidate all meetup-related queries to refresh UI in both map and list views
        queryClient.invalidateQueries({ queryKey: ['/api/meetups'] }),
        queryClient.invalidateQueries({ queryKey: [`/api/meetups/${meetupId}`] })
      ]);

      toast({
        title: "Success",
        description: "Request cancelled successfully",
      });
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast({
        title: "Error",
        description: "Failed to cancel request. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Log the results after query completion
  console.log('usePendingRequests hook results:', {
    pendingRequests,
    userId: user?.id,
    totalPending: pendingRequests?.length || 0
  });

  return {
    pendingRequests: user ? pendingRequests : [],
    totalPending: user ? (pendingRequests?.length || 0) : 0,
    isLoading,
    cancelRequest,
  };
}