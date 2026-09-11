import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@db/schema';
import { useLocation } from 'wouter';
import { useCallback } from 'react';
import { useUser } from './use-user';

export function useNotifications() {
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();
  const { user } = useUser();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    queryFn: async () => {
      const response = await fetch('/api/notifications', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: 0, // Don't cache between sessions
    gcTime: 0, // Don't keep stale data between sessions
    placeholderData: [] // Use empty array as placeholder
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    }
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    }
  });

  const markAsSeen = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await fetch(`/api/notifications/${notificationId}/seen`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to mark notification as seen');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    }
  });

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    if (!notification.isSeen) {
      await markAsSeen.mutateAsync(notification.id);
    }

    // Add a small delay to allow the dropdown to close
    setTimeout(() => {
      if (notification.link) {
        setLocation(notification.link);
      }
    }, 100);
  }, [markAsSeen, setLocation]);

  const unseenCount = notifications?.filter(n => !n.isSeen).length || 0;

  return {
    notifications: user ? notifications : [],
    unseenCount,
    isLoading,
    markAsRead: markAsRead.mutateAsync,
    markAsSeen: markAsSeen.mutateAsync,
    markAllAsRead: markAllAsRead.mutateAsync,
    handleNotificationClick
  };
}