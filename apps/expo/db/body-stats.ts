import { desc, eq } from 'drizzle-orm';
import { getLocalDb } from './client';
import { localBodyStats, localBodyweightHistory } from './local-schema';

export interface BodyStatsData {
  bodyweightKg: number | null;
  heightCm?: number | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatG: number | null;
  recordedAt?: string | null;
  updatedAt?: string | Date | null;
}

export interface BodyweightHistoryEntry {
  id: string;
  userId: string;
  bodyweightKg: number;
  recordedAt: string;
  createdAt: string;
}

export async function getCachedBodyStats(userId: string): Promise<BodyStatsData | null> {
  const db = getLocalDb();
  if (!db) return null;

  const row = db.select().from(localBodyStats).where(eq(localBodyStats.userId, userId)).get();
  if (!row) return null;

  return {
    bodyweightKg: row.bodyweightKg ?? null,
    heightCm: row.heightCm ?? null,
    targetCalories: row.targetCalories ?? null,
    targetProteinG: row.targetProteinG ?? null,
    targetCarbsG: row.targetCarbsG ?? null,
    targetFatG: row.targetFatG ?? null,
    recordedAt: row.recordedAt ? row.recordedAt.toISOString() : null,
  };
}

export async function cacheBodyStats(
  userId: string,
  data: BodyStatsData,
  force = false,
): Promise<void> {
  const db = getLocalDb();
  if (!db) return;

  const incomingUpdatedAt = data.updatedAt
    ? typeof data.updatedAt === 'string'
      ? new Date(data.updatedAt).getTime()
      : data.updatedAt.getTime()
    : 0;

  const existing = db.select().from(localBodyStats).where(eq(localBodyStats.userId, userId)).get();
  if (!force && existing?.serverUpdatedAt) {
    const existingUpdatedAt =
      existing.serverUpdatedAt instanceof Date
        ? existing.serverUpdatedAt.getTime()
        : existing.serverUpdatedAt;
    if (incomingUpdatedAt && incomingUpdatedAt < existingUpdatedAt) {
      return;
    }
  }

  const now = new Date();
  db.insert(localBodyStats)
    .values({
      userId,
      bodyweightKg: data.bodyweightKg ?? null,
      heightCm: data.heightCm ?? null,
      targetCalories: data.targetCalories ?? null,
      targetProteinG: data.targetProteinG ?? null,
      targetCarbsG: data.targetCarbsG ?? null,
      targetFatG: data.targetFatG ?? null,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : null,
      serverUpdatedAt: incomingUpdatedAt ? new Date(incomingUpdatedAt) : null,
      hydratedAt: now,
    })
    .onConflictDoUpdate({
      target: localBodyStats.userId,
      set: {
        bodyweightKg: data.bodyweightKg ?? null,
        heightCm: data.heightCm ?? null,
        targetCalories: data.targetCalories ?? null,
        targetProteinG: data.targetProteinG ?? null,
        targetCarbsG: data.targetCarbsG ?? null,
        targetFatG: data.targetFatG ?? null,
        recordedAt: data.recordedAt ? new Date(data.recordedAt) : null,
        serverUpdatedAt: incomingUpdatedAt ? new Date(incomingUpdatedAt) : null,
        hydratedAt: now,
      },
    })
    .run();
}

export async function getCachedBodyweightHistory(
  userId: string,
): Promise<BodyweightHistoryEntry[]> {
  const db = getLocalDb();
  if (!db) return [];

  const rows = db
    .select()
    .from(localBodyweightHistory)
    .where(eq(localBodyweightHistory.userId, userId))
    .orderBy(desc(localBodyweightHistory.recordedAt))
    .limit(10)
    .all();

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    bodyweightKg: row.bodyweightKg,
    recordedAt: row.recordedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function hydrateBodyweightHistory(
  userId: string,
  entries: BodyweightHistoryEntry[],
): Promise<void> {
  const db = getLocalDb();
  if (!db) return;

  const now = new Date();
  for (const entry of entries) {
    db.insert(localBodyweightHistory)
      .values({
        id: entry.id,
        userId,
        bodyweightKg: entry.bodyweightKg,
        recordedAt: new Date(entry.recordedAt),
        createdAt: new Date(entry.createdAt),
        hydratedAt: now,
      })
      .onConflictDoUpdate({
        target: localBodyweightHistory.id,
        set: {
          bodyweightKg: entry.bodyweightKg,
          recordedAt: new Date(entry.recordedAt),
          createdAt: new Date(entry.createdAt),
          hydratedAt: now,
        },
      })
      .run();
  }
}
