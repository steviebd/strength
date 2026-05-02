import { eq, and } from 'drizzle-orm';
import { getLocalDb } from './client';
import { localWhoopData } from './local-schema';

export interface WhoopCacheData {
  recoveryScore: number | null;
  status: 'green' | 'yellow' | 'red' | null;
  hrv: number | null;
  caloriesBurned: number | null;
  totalStrain: number | null;
}

export async function getCachedWhoopData(
  userId: string,
  date: string,
  timezone: string,
): Promise<{ data: WhoopCacheData; hydratedAt: Date } | null> {
  const db = getLocalDb();
  if (!db) return null;

  const row = db
    .select()
    .from(localWhoopData)
    .where(
      and(
        eq(localWhoopData.userId, userId),
        eq(localWhoopData.date, date),
        eq(localWhoopData.timezone, timezone),
      ),
    )
    .get();

  if (!row) return null;

  return {
    data: {
      recoveryScore: row.recoveryScore ?? null,
      status: (row.status as 'green' | 'yellow' | 'red' | null) ?? null,
      hrv: row.hrv ?? null,
      caloriesBurned: row.caloriesBurned ?? null,
      totalStrain: row.totalStrain ?? null,
    },
    hydratedAt: row.hydratedAt,
  };
}

export async function cacheWhoopData(
  userId: string,
  date: string,
  timezone: string,
  data: WhoopCacheData,
  serverUpdatedAt: number | null,
): Promise<void> {
  const db = getLocalDb();
  if (!db) return;

  const existing = db
    .select()
    .from(localWhoopData)
    .where(
      and(
        eq(localWhoopData.userId, userId),
        eq(localWhoopData.date, date),
        eq(localWhoopData.timezone, timezone),
      ),
    )
    .get();

  if (existing?.serverUpdatedAt && serverUpdatedAt) {
    const existingTime =
      existing.serverUpdatedAt instanceof Date
        ? existing.serverUpdatedAt.getTime()
        : existing.serverUpdatedAt;
    if (serverUpdatedAt < existingTime) {
      return;
    }
  }

  const now = new Date();
  db.insert(localWhoopData)
    .values({
      userId,
      date,
      timezone,
      recoveryScore: data.recoveryScore ?? null,
      status: data.status ?? null,
      hrv: data.hrv ?? null,
      caloriesBurned: data.caloriesBurned ?? null,
      totalStrain: data.totalStrain ?? null,
      serverUpdatedAt: serverUpdatedAt ? new Date(serverUpdatedAt) : null,
      hydratedAt: now,
    })
    .onConflictDoUpdate({
      target: [localWhoopData.userId, localWhoopData.date, localWhoopData.timezone],
      set: {
        recoveryScore: data.recoveryScore ?? null,
        status: data.status ?? null,
        hrv: data.hrv ?? null,
        caloriesBurned: data.caloriesBurned ?? null,
        totalStrain: data.totalStrain ?? null,
        serverUpdatedAt: serverUpdatedAt ? new Date(serverUpdatedAt) : null,
        hydratedAt: now,
      },
    })
    .run();
}
