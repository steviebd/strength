import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import type { Template } from './useTemplateEditor';
import { cacheTemplates } from '@/db/workouts';

export type { Template };

export function useTemplates() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const templatesQuery = useQuery({
    queryKey: ['templates', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Template[]> => {
      const templates = await apiFetch<Template[]>('/api/templates');
      if (userId) {
        await cacheTemplates(userId, templates);
      }
      return templates;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const createTemplate = useMutation({
    mutationFn: async (data: { name: string; description?: string; notes?: string }) => {
      return apiFetch<Template>('/api/templates', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name: string;
      description?: string;
      notes?: string;
    }) => {
      return apiFetch<Template>(`/api/templates/${id}`, {
        method: 'PUT',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/templates/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  return {
    templates: templatesQuery.data ?? [],
    isLoading: session.isPending || templatesQuery.isLoading,
    isError: templatesQuery.isError,
    error: templatesQuery.error,
    refetch: templatesQuery.refetch,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
