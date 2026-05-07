import { and, asc, eq } from 'drizzle-orm';
import { apiFetch } from '@/lib/api';
import { getLocalDb, withLocalTransaction } from './client';
import {
  localNutritionChatMessages,
  localNutritionEntries,
  localNutritionTrainingContext,
} from './local-schema';

interface ChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  hasImage?: boolean;
  createdAt?: string | null;
}

interface ChatHistoryResponse {
  messages: ChatHistoryMessage[];
  nextCursor: number | null;
  hasMore: boolean;
}

interface NutritionEntry {
  id: string;
  name: string | null;
  mealType: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  loggedAt: string;
}

interface TrainingContext {
  id: string;
  trainingType: string;
  customLabel?: string | null;
}

const CHAT_HISTORY_FETCH_LIMIT = 50;

function buildNutritionDateUrl(path: string, date: string, timezone: string) {
  const params = new URLSearchParams({ date });
  if (timezone) {
    params.set('timezone', timezone);
  }
  return `${path}?${params.toString()}`;
}

export async function hydrateNutritionChat(userId: string, date: string, timezone: string) {
  const db = getLocalDb();
  if (!db) return;

  let allMessages: ChatHistoryMessage[] = [];
  let cursor: number | null = null;

  do {
    const urlParams: Record<string, string | number> = {
      date,
      timezone,
      limit: CHAT_HISTORY_FETCH_LIMIT,
    };
    if (cursor) {
      urlParams.before = cursor;
    }
    const searchParams = new URLSearchParams(
      Object.entries(urlParams).map(([k, v]) => [k, String(v)]),
    );
    const response = await apiFetch<ChatHistoryResponse>(
      `/api/nutrition/chat/history?${searchParams.toString()}`,
    );
    allMessages = [...allMessages, ...response.messages];
    cursor = response.nextCursor;
  } while (cursor);

  const syncedAt = new Date();

  withLocalTransaction(() => {
    db.delete(localNutritionChatMessages)
      .where(
        and(
          eq(localNutritionChatMessages.userId, userId),
          eq(localNutritionChatMessages.date, date),
        ),
      )
      .run();

    for (const message of allMessages) {
      db.insert(localNutritionChatMessages)
        .values({
          id: message.id,
          userId,
          date,
          role: message.role,
          content: message.content,
          hasImage: message.hasImage ?? false,
          imageUri: null,
          createdAt: message.createdAt ? new Date(message.createdAt) : syncedAt,
          syncedAt,
        })
        .run();
    }
  });
}

export async function hydrateNutritionEntries(userId: string, date: string, timezone: string) {
  const db = getLocalDb();
  if (!db) return;

  const url = buildNutritionDateUrl('/api/nutrition/entries', date, timezone);
  const entries = await apiFetch<NutritionEntry[]>(url);

  const syncedAt = new Date();

  withLocalTransaction(() => {
    db.delete(localNutritionEntries)
      .where(and(eq(localNutritionEntries.userId, userId), eq(localNutritionEntries.date, date)))
      .run();

    for (const entry of entries) {
      db.insert(localNutritionEntries)
        .values({
          id: entry.id,
          userId,
          date,
          mealType: entry.mealType ?? null,
          name: entry.name ?? null,
          calories: entry.calories ?? null,
          proteinG: entry.proteinG ?? null,
          carbsG: entry.carbsG ?? null,
          fatG: entry.fatG ?? null,
          loggedAt: entry.loggedAt ? new Date(entry.loggedAt) : syncedAt,
          syncedAt,
        })
        .run();
    }
  });
}

export async function hydrateNutritionTrainingContext(userId: string) {
  const db = getLocalDb();
  if (!db) return;

  const context = await apiFetch<TrainingContext | null>('/api/nutrition/training-context');
  if (!context) return;

  const syncedAt = new Date();

  db.insert(localNutritionTrainingContext)
    .values({
      id: context.id,
      userId,
      trainingType: context.trainingType,
      customLabel: context.customLabel ?? null,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: localNutritionTrainingContext.userId,
      set: {
        trainingType: context.trainingType,
        customLabel: context.customLabel ?? null,
        syncedAt,
      },
    })
    .run();
}

export async function hydrateNutritionCache(userId: string, date: string, timezone: string) {
  try {
    await hydrateNutritionChat(userId, date, timezone);
  } catch {
    /* offline expected */
  }
  try {
    await hydrateNutritionEntries(userId, date, timezone);
  } catch {
    /* offline expected */
  }
  try {
    await hydrateNutritionTrainingContext(userId);
  } catch {
    /* offline expected */
  }
}

export function getLocalChatMessages(userId: string, date: string): ChatHistoryMessage[] {
  const db = getLocalDb();
  if (!db) return [];

  return db
    .select({
      id: localNutritionChatMessages.id,
      role: localNutritionChatMessages.role,
      content: localNutritionChatMessages.content,
      hasImage: localNutritionChatMessages.hasImage,
      createdAt: localNutritionChatMessages.createdAt,
    })
    .from(localNutritionChatMessages)
    .where(
      and(eq(localNutritionChatMessages.userId, userId), eq(localNutritionChatMessages.date, date)),
    )
    .orderBy(asc(localNutritionChatMessages.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      hasImage: row.hasImage,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
    }));
}

export function getLocalNutritionEntries(userId: string, date: string): NutritionEntry[] {
  const db = getLocalDb();
  if (!db) return [];

  return db
    .select()
    .from(localNutritionEntries)
    .where(and(eq(localNutritionEntries.userId, userId), eq(localNutritionEntries.date, date)))
    .orderBy(asc(localNutritionEntries.loggedAt))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name ?? null,
      mealType: row.mealType ?? null,
      calories: row.calories ?? null,
      proteinG: row.proteinG ?? null,
      carbsG: row.carbsG ?? null,
      fatG: row.fatG ?? null,
      loggedAt:
        row.loggedAt instanceof Date ? row.loggedAt.toISOString() : new Date(0).toISOString(),
    }));
}

export function getLocalTrainingContext(userId: string): TrainingContext | null {
  const db = getLocalDb();
  if (!db) return null;

  const row = db
    .select()
    .from(localNutritionTrainingContext)
    .where(eq(localNutritionTrainingContext.userId, userId))
    .get();

  if (!row) return null;

  return {
    id: row.id,
    trainingType: row.trainingType,
    customLabel: row.customLabel ?? null,
  };
}

export function getLocalChatMessageImageUri(userId: string, messageId: string): string | null {
  const db = getLocalDb();
  if (!db) return null;

  const row = db
    .select({ imageUri: localNutritionChatMessages.imageUri })
    .from(localNutritionChatMessages)
    .where(
      and(
        eq(localNutritionChatMessages.userId, userId),
        eq(localNutritionChatMessages.id, messageId),
      ),
    )
    .get();

  return row?.imageUri ?? null;
}

export function cacheLocalChatMessageImageUri(userId: string, messageId: string, imageUri: string) {
  const db = getLocalDb();
  if (!db) return;

  db.update(localNutritionChatMessages)
    .set({ imageUri })
    .where(
      and(
        eq(localNutritionChatMessages.userId, userId),
        eq(localNutritionChatMessages.id, messageId),
      ),
    )
    .run();
}

export function hasCachedNutritionChat(userId: string, date: string): boolean {
  const db = getLocalDb();
  if (!db) return false;

  const row = db
    .select({ id: localNutritionChatMessages.id })
    .from(localNutritionChatMessages)
    .where(
      and(eq(localNutritionChatMessages.userId, userId), eq(localNutritionChatMessages.date, date)),
    )
    .limit(1)
    .get();

  return !!row;
}

export function hasCachedNutritionEntries(userId: string, date: string): boolean {
  const db = getLocalDb();
  if (!db) return false;

  const row = db
    .select({ id: localNutritionEntries.id })
    .from(localNutritionEntries)
    .where(and(eq(localNutritionEntries.userId, userId), eq(localNutritionEntries.date, date)))
    .limit(1)
    .get();

  return !!row;
}
