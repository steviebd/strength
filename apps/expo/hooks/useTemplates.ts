import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import type { Template } from '@/components/template/TemplateEditor/types';
import { cacheTemplates } from '@/db/workouts';
import { getCachedTemplates } from '@/db/training-cache';

export type { Template };

export function useTemplates() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const templatesQuery = useQuery({
    queryKey: ['templates', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Template[]> => {
      if (userId) {
        const cached = await getCachedTemplates(userId);
        if (cached.length > 0) {
          void apiFetch<Template[]>('/api/templates')
            .then(async (templates) => {
              await cacheTemplates(userId, templates);
              queryClient.setQueryData(['templates', userId], templates);
            })
            .catch(() => {});
          return cached;
        }
      }
      try {
        const templates = await apiFetch<Template[]>('/api/templates');
        if (userId) {
          await cacheTemplates(userId, templates);
        }
        return templates;
      } catch (error) {
        if (userId) {
          const cached = await getCachedTemplates(userId);
          if (cached.length > 0) return cached;
        }
        throw error;
      }
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
