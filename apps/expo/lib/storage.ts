import AsyncStorage from '@react-native-async-storage/async-storage';
import { platformStorage } from './platform-storage';

const STORAGE_KEYS = {
  LAST_WORKOUT: (exerciseId: string) => `lw_${exerciseId}`,
  PENDING_WORKOUTS: 'pending_workouts',
  DISMISSED_DEVICE_TIMEZONE: 'dismissed_device_timezone',
  NUTRITION_CHAT_MESSAGES: (date: string) => `nutrition_chat_messages_${date}`,
  NUTRITION_CHAT_DRAFT: (date: string) => `nutrition_chat_draft_${date}`,
  NUTRITION_PENDING_IMAGE: (date: string) => `nutrition_pending_image_${date}`,
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

interface NutritionChatCache {
  messages: unknown[];
  cachedAt: string;
}

interface NutritionPendingImage {
  base64: string;
  uri: string;
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
    messages,
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

async function getNutritionPendingImage(date: string): Promise<NutritionPendingImage | null> {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.NUTRITION_PENDING_IMAGE(date));
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
    await AsyncStorage.removeItem(key);
    return;
  }

  await AsyncStorage.setItem(key, JSON.stringify(image));
}

async function getDismissedDeviceTimezone(): Promise<string | null> {
  return platformStorage.getItem(STORAGE_KEYS.DISMISSED_DEVICE_TIMEZONE);
}

async function setDismissedDeviceTimezone(timezone: string | null): Promise<void> {
  if (!timezone) {
    platformStorage.removeItem(STORAGE_KEYS.DISMISSED_DEVICE_TIMEZONE);
    return;
  }
  platformStorage.setItem(STORAGE_KEYS.DISMISSED_DEVICE_TIMEZONE, timezone);
}

export {
  LastWorkoutData,
  PendingWorkout,
  getLastWorkout,
  setLastWorkout,
  getPendingWorkouts,
  addPendingWorkout,
  removePendingWorkout,
  clearPendingWorkouts,
  getNutritionChatMessages,
  setNutritionChatMessages,
  getNutritionChatDraft,
  setNutritionChatDraft,
  getNutritionPendingImage,
  setNutritionPendingImage,
  getDismissedDeviceTimezone,
  setDismissedDeviceTimezone,
};
