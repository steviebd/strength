import { eq } from 'drizzle-orm';
import { platformStorage } from './platform-storage';
import { getLocalDb } from '../db/client';
import { localPendingWorkouts } from '../db/local-schema';

const MAX_CACHED_CHAT_MESSAGES = 20;

const STORAGE_KEYS = {
  PENDING_WORKOUTS: 'pending_workouts',
  DISMISSED_DEVICE_TIMEZONE: 'dismissed_device_timezone',
  NUTRITION_CHAT_MESSAGES: (date: string) => `nutrition_chat_messages_${date}`,
  NUTRITION_CHAT_DRAFT: (date: string) => `nutrition_chat_draft_${date}`,
  NUTRITION_PENDING_IMAGE: (date: string) => `nutrition_pending_image_${date}`,
} as const;

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

interface NutritionChatCache {
  messages: unknown[];
  cachedAt: string;
}

interface NutritionPendingImage {
  base64: string;
  uri: string;
}

async function getPendingWorkouts(): Promise<PendingWorkout[]> {
  const db = getLocalDb();
  if (!db) return [];
  const rows = db.select().from(localPendingWorkouts).all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startedAt: row.startedAt,
    completedAt: null,
    source: row.source as 'program',
    programCycleId: row.programCycleId,
    cycleWorkoutId: row.cycleWorkoutId,
    exercises: row.exercisesJson ? JSON.parse(row.exercisesJson) : [],
    exerciseCount: row.exerciseCount,
    durationMinutes: null,
    totalVolume: null,
    totalSets: null,
  }));
}

async function addPendingWorkout(workout: PendingWorkout): Promise<void> {
  const db = getLocalDb();
  if (!db) return;
  db.insert(localPendingWorkouts)
    .values({
      id: workout.id,
      name: workout.name,
      startedAt: workout.startedAt,
      source: workout.source,
      programCycleId: workout.programCycleId,
      cycleWorkoutId: workout.cycleWorkoutId,
      exercisesJson: JSON.stringify(workout.exercises),
      exerciseCount: workout.exerciseCount,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: localPendingWorkouts.id,
      set: {
        name: workout.name,
        startedAt: workout.startedAt,
        source: workout.source,
        programCycleId: workout.programCycleId,
        cycleWorkoutId: workout.cycleWorkoutId,
        exercisesJson: JSON.stringify(workout.exercises),
        exerciseCount: workout.exerciseCount,
        createdAt: new Date(),
      },
    })
    .run();
}

async function removePendingWorkout(workoutId: string): Promise<void> {
  const db = getLocalDb();
  if (!db) return;
  db.delete(localPendingWorkouts).where(eq(localPendingWorkouts.id, workoutId)).run();
}

async function getNutritionChatMessages<T>(date: string): Promise<T[]> {
  const data = platformStorage.getItem(STORAGE_KEYS.NUTRITION_CHAT_MESSAGES(date));
  if (!data) return [];
  try {
    const parsed = JSON.parse(data) as NutritionChatCache;
    return Array.isArray(parsed.messages) ? (parsed.messages as T[]) : [];
  } catch {
    return [];
  }
}

async function setNutritionChatMessages<T>(date: string, messages: T[]): Promise<void> {
  const data: NutritionChatCache = {
    messages: messages.slice(-MAX_CACHED_CHAT_MESSAGES),
    cachedAt: new Date().toISOString(),
  };
  platformStorage.setItem(STORAGE_KEYS.NUTRITION_CHAT_MESSAGES(date), JSON.stringify(data));
}

async function getNutritionChatDraft(date: string): Promise<string> {
  return platformStorage.getItem(STORAGE_KEYS.NUTRITION_CHAT_DRAFT(date)) ?? '';
}

async function setNutritionChatDraft(date: string, draft: string): Promise<void> {
  if (!draft) {
    platformStorage.removeItem(STORAGE_KEYS.NUTRITION_CHAT_DRAFT(date));
    return;
  }

  platformStorage.setItem(STORAGE_KEYS.NUTRITION_CHAT_DRAFT(date), draft);
}

// Images are stored as base64 URIs in SecureStore (native) / localStorage (web).
// If size limits are hit, the caller handles it (e.g. by compressing or clearing).
async function getNutritionPendingImage(date: string): Promise<NutritionPendingImage | null> {
  const data = platformStorage.getItem(STORAGE_KEYS.NUTRITION_PENDING_IMAGE(date));
  if (!data) return null;

  try {
    const parsed = JSON.parse(data) as NutritionPendingImage;
    if (!parsed.base64 || !parsed.uri) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function setNutritionPendingImage(
  date: string,
  image: NutritionPendingImage | null,
): Promise<void> {
  const key = STORAGE_KEYS.NUTRITION_PENDING_IMAGE(date);

  if (!image) {
    platformStorage.removeItem(key);
    return;
  }

  platformStorage.setItem(key, JSON.stringify(image));
}

async function removeNutritionPendingImage(date: string): Promise<void> {
  platformStorage.removeItem(STORAGE_KEYS.NUTRITION_PENDING_IMAGE(date));
}

export {
  getPendingWorkouts,
  addPendingWorkout,
  removePendingWorkout,
  getNutritionChatMessages,
  setNutritionChatMessages,
  getNutritionChatDraft,
  setNutritionChatDraft,
  getNutritionPendingImage,
  setNutritionPendingImage,
  removeNutritionPendingImage,
};
