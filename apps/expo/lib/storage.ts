import { platformStorage } from './platform-storage';

const STORAGE_KEYS = {
  LAST_WORKOUT: (exerciseId: string) => `lw:${exerciseId}`,
  CACHED_PROGRAMS: 'cached_programs',
  PENDING_WORKOUTS: 'pending_workouts',
  ACTIVE_WORKOUT_SESSION: 'active_workout_session',
} as const;

interface LastWorkoutData {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  date: string;
}

interface PendingWorkout {
  id: string;
  name: string;
  startedAt: string;
  completedAt: null;
  source: 'program';
  programCycleId: string;
  cycleWorkoutId: string;
  exercises: any[];
  exerciseCount: number;
  durationMinutes: null;
  totalVolume: null;
  totalSets: null;
}

interface CachedProgramData {
  programs: any[];
  cachedAt: string;
}

async function getLastWorkout(exerciseId: string): Promise<LastWorkoutData | null> {
  const key = STORAGE_KEYS.LAST_WORKOUT(exerciseId);
  const data = platformStorage.getItem(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as LastWorkoutData;
  } catch {
    return null;
  }
}

async function setLastWorkout(exerciseId: string, data: LastWorkoutData): Promise<void> {
  const key = STORAGE_KEYS.LAST_WORKOUT(exerciseId);
  platformStorage.setItem(key, JSON.stringify(data));
}

async function getCachedPrograms(): Promise<any[] | null> {
  const data = platformStorage.getItem(STORAGE_KEYS.CACHED_PROGRAMS);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as CachedProgramData;
    return parsed.programs;
  } catch {
    return null;
  }
}

async function setCachedPrograms(programs: any[]): Promise<void> {
  const data: CachedProgramData = {
    programs,
    cachedAt: new Date().toISOString(),
  };
  platformStorage.setItem(STORAGE_KEYS.CACHED_PROGRAMS, JSON.stringify(data));
}

async function clearCachedPrograms(): Promise<void> {
  platformStorage.setItem(STORAGE_KEYS.CACHED_PROGRAMS, '');
}

async function getPendingWorkouts(): Promise<PendingWorkout[]> {
  const data = platformStorage.getItem(STORAGE_KEYS.PENDING_WORKOUTS);
  if (!data) return [];
  try {
    return JSON.parse(data) as PendingWorkout[];
  } catch {
    return [];
  }
}

async function addPendingWorkout(workout: PendingWorkout): Promise<void> {
  const workouts = await getPendingWorkouts();
  workouts.push(workout);
  platformStorage.setItem(STORAGE_KEYS.PENDING_WORKOUTS, JSON.stringify(workouts));
}

async function removePendingWorkout(workoutId: string): Promise<void> {
  const workouts = await getPendingWorkouts();
  const filtered = workouts.filter((w) => w.id !== workoutId);
  platformStorage.setItem(STORAGE_KEYS.PENDING_WORKOUTS, JSON.stringify(filtered));
}

async function clearPendingWorkouts(): Promise<void> {
  platformStorage.setItem(STORAGE_KEYS.PENDING_WORKOUTS, '');
}

async function getActiveWorkoutSession(): Promise<{ workout: any; exercises: any[] } | null> {
  const data = platformStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT_SESSION);
  if (!data) return null;
  try {
    return JSON.parse(data) as { workout: any; exercises: any[] };
  } catch {
    return null;
  }
}

async function setActiveWorkoutSession(data: { workout: any; exercises: any[] }): Promise<void> {
  platformStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT_SESSION, JSON.stringify(data));
}

async function clearActiveWorkoutSession(): Promise<void> {
  platformStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT_SESSION, '');
}

export {
  STORAGE_KEYS,
  LastWorkoutData,
  PendingWorkout,
  CachedProgramData,
  getLastWorkout,
  setLastWorkout,
  getCachedPrograms,
  setCachedPrograms,
  clearCachedPrograms,
  getPendingWorkouts,
  addPendingWorkout,
  removePendingWorkout,
  clearPendingWorkouts,
  getActiveWorkoutSession,
  setActiveWorkoutSession,
  clearActiveWorkoutSession,
};
