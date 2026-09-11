import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Group, NewGroup } from '@db/schema';

export function useGroups() {
  const queryClient = useQueryClient();

  const { data: groups, isLoading } = useQuery<Group[]>({
    queryKey: ['/api/groups'],
  });

  const createGroup = useMutation({
    mutationFn: async (group: NewGroup) => {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(group),
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
    }
  });

  const addMember = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: number, userId: number }) => {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
    }
  });

  return {
    groups,
    isLoading,
    createGroup: createGroup.mutateAsync,
    addMember: addMember.mutateAsync
  };
}
