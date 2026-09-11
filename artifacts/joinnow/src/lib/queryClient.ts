import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!res.ok) {
          if (res.status === 401) {
            // Unauthorized - clear any stale state
            queryClient.clear();
            // If we're not on the auth page, redirect to it
            if (!window.location.pathname.includes('auth')) {
              window.location.href = '/auth';
            }
            throw new Error('Not authenticated');
          }

          if (res.status >= 500) {
            throw new Error(`Server error: ${res.status}`);
          }

          const errorText = await res.text();
          throw new Error(errorText || `Request failed with status ${res.status}`);
        }

        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry auth failures
        if (error.message === 'Not authenticated') return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    }
  },
});