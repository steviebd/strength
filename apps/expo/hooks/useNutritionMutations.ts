import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateId } from '@strength/db/client';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { invalidateDailySummary } from '@/db/nutrition';
import { OfflineError, tryOnlineOrEnqueue } from '@/lib/offline-mutation';

interface MealEntry {
  id: string;
  name: string | null;
  mealType: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  loggedAt: string | null;
}

interface DailySummary {
  entries: MealEntry[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  targetMeta: {
    strategy: 'manual' | 'bodyweight' | 'default';
    explanation: string;
    calorieMultiplier: number;
  };
  bodyweightKg: number | null;
  trainingContext: { type: string; customLabel?: string } | null;
  whoopRecovery: {
    score: number | null;
    status: 'green' | 'yellow' | 'red' | null;
    hrv: number | null;
  } | null;
  whoopCycle: { caloriesBurned: number | null; totalStrain: number | null } | null;
}

function removeEntryFromSummary(summary: DailySummary | undefined, entryId: string) {
  if (!summary) return summary;

  const removedEntry = summary.entries.find((entry) => entry.id === entryId);
  if (!removedEntry) return summary;

  return {
    ...summary,
    entries: summary.entries.filter((entry) => entry.id !== entryId),
    totals: {
      calories: summary.totals.calories - (removedEntry.calories ?? 0),
      proteinG: summary.totals.proteinG - (removedEntry.proteinG ?? 0),
      carbsG: summary.totals.carbsG - (removedEntry.carbsG ?? 0),
      fatG: summary.totals.fatG - (removedEntry.fatG ?? 0),
    },
  };
}

export function useNutritionMutations(options: {
  date: string;
  activeTimezone: string | null | undefined;
  dailySummaryQueryKey: unknown[];
  refetchSummary: () => void;
  clearSavedEntryFromMessages: (entryId: string) => void;
}) {
  const {
    date,
    activeTimezone,
    dailySummaryQueryKey,
    refetchSummary,
    clearSavedEntryFromMessages,
  } = options;
  const queryClient = useQueryClient();
  const session = authClient.useSession();

  const saveMealMutation = useMutation({
    mutationFn: (data: {
      name: string;
      mealType: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }) => {
      const payload = {
        name: data.name,
        mealType: data.mealType,
        calories: data.calories,
        proteinG: data.protein,
        carbsG: data.carbs,
        fatG: data.fat,
      };

      const userId = session.data?.user?.id;
      if (!userId) {
        return apiFetch('/api/nutrition/entries', {
          method: 'POST',
          body: payload,
        });
      }

      return tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch('/api/nutrition/entries', {
            method: 'POST',
            body: payload,
          }),
        userId,
        entityType: 'meal',
        operation: 'save_meal',
        entityId: generateId(),
        payload,
      });
    },
    onMutate: async () => {
      const userId = session.data?.user?.id;
      if (userId) {
        await invalidateDailySummary(userId, date, activeTimezone ?? 'UTC');
      }
    },
    onSuccess: () => {
      refetchSummary();
    },
  });

  const deleteMealMutation = useMutation({
    mutationFn: (id: string) => {
      const userId = session.data?.user?.id;
      if (!userId) {
        return apiFetch(`/api/nutrition/entries/${id}`, { method: 'DELETE' });
      }

      return tryOnlineOrEnqueue({
        apiCall: () => apiFetch(`/api/nutrition/entries/${id}`, { method: 'DELETE' }),
        userId,
        entityType: 'meal',
        operation: 'delete_meal',
        entityId: id,
        payload: {},
      });
    },
    onMutate: async (entryId) => {
      const userId = session.data?.user?.id;
      if (userId) {
        await invalidateDailySummary(userId, date, activeTimezone ?? 'UTC');
      }
      await queryClient.cancelQueries({ queryKey: dailySummaryQueryKey });
      const previousSummary = queryClient.getQueryData<DailySummary>(dailySummaryQueryKey);

      queryClient.setQueryData<DailySummary | undefined>(dailySummaryQueryKey, (current) =>
        removeEntryFromSummary(current, entryId),
      );

      return { previousSummary };
    },
    onError: (error, _entryId, context) => {
      if (error instanceof OfflineError) {
        return;
      }
      if (context?.previousSummary) {
        queryClient.setQueryData(dailySummaryQueryKey, context.previousSummary);
      }
    },
    onSuccess: (_data, entryId) => {
      clearSavedEntryFromMessages(entryId);
      void queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey });
    },
  });

  const trainingContextMutation = useMutation({
    mutationFn: (type: string) => {
      const payload = { trainingType: type, date, timezone: activeTimezone };
      const userId = session.data?.user?.id;
      if (!userId) {
        return apiFetch('/api/nutrition/training-context', {
          method: 'POST',
          body: payload,
        });
      }

      return tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch('/api/nutrition/training-context', {
            method: 'POST',
            body: payload,
          }),
        userId,
        entityType: 'training_context',
        operation: 'save_training_context',
        entityId: generateId(),
        payload,
      });
    },
    onMutate: async () => {
      const userId = session.data?.user?.id;
      if (userId) {
        await invalidateDailySummary(userId, date, activeTimezone ?? 'UTC');
      }
    },
    onSuccess: () => {
      refetchSummary();
    },
  });

  return { saveMealMutation, deleteMealMutation, trainingContextMutation };
}
