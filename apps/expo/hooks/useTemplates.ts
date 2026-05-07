import { and, eq } from 'drizzle-orm';
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
import { hasPendingTrainingWrites } from '@/db/training-read-model';
import { useOfflineQuery } from './useOfflineQuery';

export type { Template };

export function useTemplates() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const templatesQuery = useOfflineQuery({
    queryKey: ['templates', userId],
    enabled: !!userId,
    apiFn: () => apiFetch<Template[]>('/api/templates', { cache: 'no-store' }),
    cacheFn: async () => {
      const cached = await getCachedTemplates(userId!);
      return cached.length > 0 ? cached : null;
    },
    writeCacheFn: (data) => cacheTemplates(userId!, data),
    networkFirst: true,
    fallbackToCacheOnError: true,
    isDirtyFn: () => hasPendingTrainingWrites(userId!, ['template']),
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
            body: { id: entityId, ...data },
          }),
        userId: userId!,
        entityType: 'template',
        operation: 'create_template',
        entityId,
        payload: { id: entityId, ...data },
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
            .onConflictDoUpdate({
              target: localTemplates.id,
              set: {
                name: data.name,
                description: data.description ?? null,
                notes: data.notes ?? null,
                isDeleted: false,
                updatedAt: now,
                hydratedAt: now,
              },
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
      const db = getLocalDb();
      const localTemplate =
        db && typeof (db as any).select === 'function'
          ? db
              .select({ createdLocally: localTemplates.createdLocally })
              .from(localTemplates)
              .where(eq(localTemplates.id, id))
              .get()
          : null;

      if (db && localTemplate?.createdLocally) {
        const now = new Date();
        db.update(localTemplates)
          .set({ isDeleted: true, updatedAt: now })
          .where(eq(localTemplates.id, id))
          .run();
        db.delete(localSyncQueue)
          .where(
            and(
              eq(localSyncQueue.entityType, 'template'),
              eq(localSyncQueue.entityId, id),
              eq(localSyncQueue.operation, 'create_template'),
            ),
          )
          .run();
        return { success: true };
      }

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
