import { sql, and, or, eq } from 'drizzle-orm';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateId } from '@strength/db/client';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { OfflineError, tryOnlineOrEnqueue } from '@/lib/offline-mutation';
import type { Template } from '@/components/template/TemplateEditor/types';
import { cacheTemplates } from '@/db/workouts';
import { getCachedTemplates } from '@/db/training-cache';
import { getLocalDb } from '@/db/client';
import { localTemplates, localSyncQueue } from '@/db/local-schema';
import { useOfflineQuery } from './useOfflineQuery';

export type { Template };

export function useTemplates() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const templatesQuery = useOfflineQuery({
    queryKey: ['templates', userId],
    enabled: !!userId,
    apiFn: () => apiFetch<Template[]>('/api/templates'),
    cacheFn: () => getCachedTemplates(userId!),
    writeCacheFn: (data) => cacheTemplates(userId!, data),
    isDirtyFn: async () => {
      const db = getLocalDb();
      if (!db) return false;
      const locallyCreated = db
        .select({ count: sql<number>`count(*)` })
        .from(localTemplates)
        .where(and(eq(localTemplates.userId, userId!), eq(localTemplates.createdLocally, true)))
        .get();
      if ((locallyCreated?.count ?? 0) > 0) return true;
      const pending = db
        .select({ count: sql<number>`count(*)` })
        .from(localSyncQueue)
        .where(
          and(
            eq(localSyncQueue.userId, userId!),
            eq(localSyncQueue.entityType, 'template'),
            or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
          ),
        )
        .get();
      return (pending?.count ?? 0) > 0;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const createTemplate = useMutation({
    mutationFn: async (data: { name: string; description?: string; notes?: string }) => {
      const entityId = generateId();
      return tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch<Template>('/api/templates', {
            method: 'POST',
            body: data,
          }),
        userId: userId!,
        entityType: 'template',
        operation: 'create_template',
        entityId,
        payload: data,
        onEnqueue: async () => {
          const db = getLocalDb();
          if (!db) return;
          const now = new Date();
          db.insert(localTemplates)
            .values({
              id: entityId,
              userId: userId!,
              name: data.name,
              description: data.description ?? null,
              notes: data.notes ?? null,
              isDeleted: false,
              createdLocally: true,
              createdAt: now,
              updatedAt: now,
              hydratedAt: now,
            })
            .run();
        },
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
      return tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch<Template>(`/api/templates/${id}`, {
            method: 'PUT',
            body: data,
          }),
        userId: userId!,
        entityType: 'template',
        operation: 'save_template',
        entityId: id,
        payload: data,
        onEnqueue: async () => {
          const db = getLocalDb();
          if (!db) return;
          const now = new Date();
          db.update(localTemplates)
            .set({
              name: data.name,
              description: data.description ?? null,
              notes: data.notes ?? null,
              updatedAt: now,
            })
            .where(eq(localTemplates.id, id))
            .run();
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      return tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch(`/api/templates/${id}`, {
            method: 'DELETE',
          }),
        userId: userId!,
        entityType: 'template',
        operation: 'delete_template',
        entityId: id,
        payload: {},
        onEnqueue: async () => {
          const db = getLocalDb();
          if (!db) return;
          const now = new Date();
          db.update(localTemplates)
            .set({ isDeleted: true, updatedAt: now })
            .where(eq(localTemplates.id, id))
            .run();
        },
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

export { OfflineError };
