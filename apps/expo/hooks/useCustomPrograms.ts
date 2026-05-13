import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { generateId } from '@strength/db/client';
import { tryOnlineOrEnqueue } from '@/lib/offline-mutation';
import { getLocalDb } from '@/db/client';
import { localCustomPrograms } from '@/db/local-schema';
import { getCachedCustomPrograms, upsertLocalCustomProgramSnapshot } from '@/db/training-cache';
import { hasPendingTrainingWrites } from '@/db/training-read-model';
import { useOfflineQuery } from './useOfflineQuery';

export interface CustomProgramListItem {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  daysPerWeek: number;
  weeks: number;
  createdAt: number;
}

export interface CustomProgramWithWorkouts extends CustomProgramListItem {
  workouts: CustomProgramWorkoutWithExercises[];
}

export interface CustomProgramWorkoutWithExercises {
  id: string;
  customProgramId: string;
  dayIndex: number;
  name: string;
  orderIndex: number;
  exercises: CustomProgramExercise[];
}

export interface CustomProgramExercise {
  id: string;
  customProgramWorkoutId: string;
  exerciseId: string;
  orderIndex: number;
  exerciseType: string;
  sets: number | null;
  reps: number | null;
  repsRaw: string | null;
  weightMode: string | null;
  fixedWeight: number | null;
  percentageOfLift: number | null;
  percentageLift: string | null;
  addedWeight: number | null;
  targetDuration: number | null;
  targetDistance: number | null;
  targetHeight: number | null;
  isAmrap: boolean;
  isAccessory: boolean;
  isRequired: boolean;
  setNumber: number | null;
  progressionAmount: number | null;
  progressionInterval: number | null;
  progressionType: string | null;
  name: string;
  muscleGroup: string | null;
  libraryId: string | null;
}

export function useCustomPrograms() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const programsQuery = useOfflineQuery({
    queryKey: ['customPrograms', userId],
    enabled: !!userId,
    apiFn: async () => {
      const programs = await apiFetch<CustomProgramListItem[]>('/api/custom-programs');
      return Promise.all(
        programs.map((program) =>
          apiFetch<CustomProgramWithWorkouts>(`/api/custom-programs/${program.id}`),
        ),
      );
    },
    cacheFn: async () => {
      const cached = await getCachedCustomPrograms(userId!);
      return cached.length > 0 ? cached : null;
    },
    writeCacheFn: async (data) => {
      for (const program of data ?? []) {
        await upsertLocalCustomProgramSnapshot(userId!, program as any, { createdLocally: false });
      }
    },
    fallbackToCacheOnError: true,
    isDirtyFn: () => hasPendingTrainingWrites(userId!, ['custom_program']),
    staleTime: Infinity,
  });

  return {
    programs: (programsQuery.data ?? []) as CustomProgramWithWorkouts[],
    isLoading: session.isPending || programsQuery.isLoading,
    isError: programsQuery.isError,
    error: programsQuery.error,
    refetch: programsQuery.refetch,
    fetchPrograms: programsQuery.refetch,
  };
}

export function useSaveCustomProgram() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const save = async (payload: {
    id?: string;
    name: string;
    description?: string;
    notes?: string;
    daysPerWeek: number;
    weeks: number;
    workouts?: Array<{
      id: string;
      dayIndex: number;
      name: string;
      orderIndex: number;
      exercises?: Array<{
        id: string;
        exerciseId: string;
        orderIndex: number;
        exerciseType: string;
        sets?: number | null;
        reps?: number | null;
        repsRaw?: string | null;
        weightMode?: string | null;
        fixedWeight?: number | null;
        percentageOfLift?: number | null;
        percentageLift?: string | null;
        addedWeight?: number | null;
        targetDuration?: number | null;
        targetDistance?: number | null;
        targetHeight?: number | null;
        isAmrap?: boolean;
        isAccessory?: boolean;
        isRequired?: boolean;
        setNumber?: number | null;
        progressionAmount?: number | null;
        progressionInterval?: number | null;
        progressionType?: string | null;
      }>;
    }>;
  }) => {
    if (!userId) throw new Error('Not authenticated');

    const isNew = !payload.id;
    const programId = payload.id ?? generateId();

    return tryOnlineOrEnqueue({
      apiCall: () =>
        apiFetch<any>('/api/custom-programs', {
          method: 'POST',
          body: { ...payload, id: programId },
        }),
      userId,
      entityType: 'custom_program',
      operation: isNew ? 'create_custom_program' : 'save_custom_program',
      entityId: programId,
      payload: { ...payload, id: programId },
      onEnqueue: async () => {
        const db = getLocalDb();
        if (!db) return;
        const now = new Date();
        db.insert(localCustomPrograms)
          .values({
            id: programId,
            userId,
            name: payload.name,
            description: payload.description ?? null,
            notes: payload.notes ?? null,
            daysPerWeek: payload.daysPerWeek,
            weeks: payload.weeks,
            isDeleted: false,
            createdLocally: true,
            createdAt: now,
            updatedAt: now,
            hydratedAt: now,
          })
          .onConflictDoUpdate({
            target: localCustomPrograms.id,
            set: {
              name: payload.name,
              description: payload.description ?? null,
              notes: payload.notes ?? null,
              daysPerWeek: payload.daysPerWeek,
              weeks: payload.weeks,
              isDeleted: false,
              updatedAt: now,
              hydratedAt: now,
            },
          })
          .run();
      },
    });
  };

  return { save };
}
