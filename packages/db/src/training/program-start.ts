import { getExerciseTypeByLibraryId } from '../exercise-library';
import { generateId } from '../schema';
import { getProgram, generateWorkoutSchedule } from '../programs';
import type { DayOfWeek } from '../programs/scheduler';

const DAY_OF_WEEK_VALUES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export interface ProgramStartPayload {
  id: string;
  programSlug: string;
  name: string;
  squat1rm: number;
  bench1rm: number;
  deadlift1rm: number;
  ohp1rm: number;
  preferredGymDays?: DayOfWeek[] | string[] | null;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | string | null;
  programStartDate?: string | null;
  firstSessionDate?: string | null;
}

export interface ProgramStartPlan {
  cycle: {
    id: string;
    programSlug: string;
    name: string;
    squat1rm: number;
    bench1rm: number;
    deadlift1rm: number;
    ohp1rm: number;
    startingSquat1rm: number;
    startingBench1rm: number;
    startingDeadlift1rm: number;
    startingOhp1rm: number;
    currentWeek: number;
    currentSession: number;
    totalSessionsCompleted: number;
    totalSessionsPlanned: number;
    status: 'active';
    isComplete: false;
    programStartAt: Date;
    firstSessionAt: Date | null;
    preferredGymDays: string[] | null;
    preferredTimeOfDay: string | null;
  };
  cycleWorkouts: Array<{
    id: string;
    cycleId: string;
    templateId: null;
    weekNumber: number;
    sessionNumber: number;
    sessionName: string;
    targetLifts: string;
    isComplete: false;
    workoutId: null;
    scheduledAt: Date | null;
  }>;
}

function parseLocalDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeGymDays(days: ProgramStartPayload['preferredGymDays']): DayOfWeek[] {
  const fallback: DayOfWeek[] = ['monday', 'wednesday', 'friday'];
  if (!Array.isArray(days) || days.length === 0) return fallback;
  const normalized: DayOfWeek[] = [];
  for (const day of days) {
    if (DAY_OF_WEEK_VALUES.includes(day as DayOfWeek)) {
      normalized.push(day as DayOfWeek);
    }
  }
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeTimeOfDay(
  value: ProgramStartPayload['preferredTimeOfDay'],
): 'morning' | 'afternoon' | 'evening' {
  return value === 'afternoon' || value === 'evening' ? value : 'morning';
}

export function createProgramStartPlan(payload: ProgramStartPayload): ProgramStartPlan {
  const program = getProgram(payload.programSlug as any);
  if (!program) {
    throw new Error('Program not found');
  }

  const oneRMs = {
    squat: payload.squat1rm,
    bench: payload.bench1rm,
    deadlift: payload.deadlift1rm,
    ohp: payload.ohp1rm,
  };
  const generatedWorkouts = program.generateWorkouts(oneRMs);
  const programStartAt = parseLocalDate(payload.programStartDate) ?? new Date();
  const firstSessionAt = parseLocalDate(payload.firstSessionDate);
  const preferredGymDays = normalizeGymDays(payload.preferredGymDays);
  const preferredTimeOfDay = normalizeTimeOfDay(payload.preferredTimeOfDay);
  const schedule = generateWorkoutSchedule(
    generatedWorkouts.map((workout) => ({
      weekNumber: workout.weekNumber,
      sessionNumber: workout.sessionNumber,
      sessionName: workout.sessionName,
    })),
    programStartAt,
    {
      preferredDays: preferredGymDays,
      preferredTimeOfDay,
      forceFirstSessionDate: firstSessionAt ?? undefined,
    },
  );
  const firstWorkout = generatedWorkouts[0];

  return {
    cycle: {
      id: payload.id,
      programSlug: payload.programSlug,
      name: payload.name,
      squat1rm: payload.squat1rm,
      bench1rm: payload.bench1rm,
      deadlift1rm: payload.deadlift1rm,
      ohp1rm: payload.ohp1rm,
      startingSquat1rm: payload.squat1rm,
      startingBench1rm: payload.bench1rm,
      startingDeadlift1rm: payload.deadlift1rm,
      startingOhp1rm: payload.ohp1rm,
      currentWeek: firstWorkout?.weekNumber ?? 1,
      currentSession: firstWorkout?.sessionNumber ?? 1,
      totalSessionsCompleted: 0,
      totalSessionsPlanned: generatedWorkouts.length,
      status: 'active',
      isComplete: false,
      programStartAt,
      firstSessionAt,
      preferredGymDays,
      preferredTimeOfDay,
    },
    cycleWorkouts: generatedWorkouts.map((workout, workoutIndex) => {
      const scheduleEntry = schedule[workoutIndex];
      const exercises = (workout.exercises ?? []).map((exercise) => ({
        name: exercise.name,
        lift: exercise.lift,
        targetWeight: exercise.targetWeight,
        sets: exercise.sets,
        reps: exercise.reps,
        exerciseType: exercise.libraryId
          ? getExerciseTypeByLibraryId(exercise.libraryId)
          : exercise.exerciseType,
        targetDuration: exercise.targetDuration ?? null,
        targetDistance: exercise.targetDistance ?? null,
        targetHeight: exercise.targetHeight ?? null,
        isAmrap: exercise.isAmrap ?? false,
        isAccessory: false,
        libraryId: exercise.libraryId,
        exerciseId: exercise.libraryId ?? exercise.name,
      }));
      const accessories = (workout.accessories ?? []).map((accessory) => ({
        name: accessory.name,
        accessoryId: accessory.accessoryId,
        libraryId: accessory.libraryId,
        targetWeight: accessory.targetWeight,
        addedWeight: accessory.addedWeight,
        sets: accessory.sets,
        reps: accessory.reps,
        exerciseType: accessory.libraryId
          ? getExerciseTypeByLibraryId(accessory.libraryId)
          : accessory.exerciseType,
        targetDuration: accessory.targetDuration ?? null,
        targetDistance: accessory.targetDistance ?? null,
        targetHeight: accessory.targetHeight ?? null,
        isAmrap: accessory.isAmrap ?? false,
        isAccessory: true,
      }));

      return {
        id: generateId(),
        cycleId: payload.id,
        templateId: null,
        weekNumber: workout.weekNumber,
        sessionNumber: workout.sessionNumber,
        sessionName: workout.sessionName,
        targetLifts: JSON.stringify({ exercises, accessories }),
        isComplete: false,
        workoutId: null,
        scheduledAt: scheduleEntry?.scheduledDate ?? null,
      };
    }),
  };
}
