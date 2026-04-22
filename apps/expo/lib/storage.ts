import { platformStorage } from './platform-storage';

const STORAGE_KEYS = {
  LAST_WORKOUT: (exerciseId: string) => `lw_${exerciseId}`,
  CACHED_PROGRAMS: 'cached_programs',
  PENDING_WORKOUTS: 'pending_workouts',
  ACTIVE_WORKOUT_SESSION: 'active_workout_session',
  NUTRITION_CHAT_MESSAGES: (date: string, timezone: string) =>
    `nutrition_chat_messages_${timezone.replace(/\//g, '---')}_${date}`,
  NUTRITION_CHAT_DRAFT: (date: string, timezone: string) =>
    `nutrition_chat_draft_${timezone.replace(/\//g, '---')}_${date}`,
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

interface NutritionChatCache {
  messages: unknown[];
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

async function getNutritionChatMessages<T>(date: string, timezone: string): Promise<T[]> {
  const data = platformStorage.getItem(STORAGE_KEYS.NUTRITION_CHAT_MESSAGES(date, timezone));
  if (!data) return [];
  try {
    const parsed = JSON.parse(data) as NutritionChatCache;
    return Array.isArray(parsed.messages) ? (parsed.messages as T[]) : [];
  } catch {
    return [];
  }
}

async function setNutritionChatMessages<T>(
  date: string,
  timezone: string,
  messages: T[],
): Promise<void> {
  const data: NutritionChatCache = {
    messages,
    cachedAt: new Date().toISOString(),
  };
  platformStorage.setItem(
    STORAGE_KEYS.NUTRITION_CHAT_MESSAGES(date, timezone),
    JSON.stringify(data),
  );
}

async function getNutritionChatDraft(date: string, timezone: string): Promise<string> {
  return platformStorage.getItem(STORAGE_KEYS.NUTRITION_CHAT_DRAFT(date, timezone)) ?? '';
}

async function setNutritionChatDraft(date: string, timezone: string, draft: string): Promise<void> {
  if (!draft) {
    platformStorage.removeItem(STORAGE_KEYS.NUTRITION_CHAT_DRAFT(date, timezone));
    return;
  }

  platformStorage.setItem(STORAGE_KEYS.NUTRITION_CHAT_DRAFT(date, timezone), draft);
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
  getNutritionChatMessages,
  setNutritionChatMessages,
  getNutritionChatDraft,
  setNutritionChatDraft,
};
