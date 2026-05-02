import { eq, and } from 'drizzle-orm';
import { getLocalDb } from './client';
import { localNutritionDailySummaries } from './local-schema';

export async function getCachedDailySummary(
  userId: string,
  date: string,
  timezone: string,
): Promise<unknown | null> {
  const db = getLocalDb();
  if (!db) return null;

  const row = db
    .select()
    .from(localNutritionDailySummaries)
    .where(
      and(
        eq(localNutritionDailySummaries.userId, userId),
        eq(localNutritionDailySummaries.date, date),
        eq(localNutritionDailySummaries.timezone, timezone),
      ),
    )
    .get();

  if (!row) return null;
  try {
    return JSON.parse(row.json);
  } catch {
    return null;
  }
}

export async function cacheDailySummary(
  userId: string,
  date: string,
  timezone: string,
  data: unknown,
): Promise<void> {
  const db = getLocalDb();
  if (!db) return;

  const now = new Date();
  db.insert(localNutritionDailySummaries)
    .values({
      userId,
      date,
      timezone,
      json: JSON.stringify(data),
      hydratedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        localNutritionDailySummaries.userId,
        localNutritionDailySummaries.date,
        localNutritionDailySummaries.timezone,
      ],
      set: {
        json: JSON.stringify(data),
        hydratedAt: now,
      },
    })
    .run();
}

export async function invalidateDailySummary(
  userId: string,
  date: string,
  timezone: string,
): Promise<void> {
  const db = getLocalDb();
  if (!db) return;

  db.delete(localNutritionDailySummaries)
    .where(
      and(
        eq(localNutritionDailySummaries.userId, userId),
        eq(localNutritionDailySummaries.date, date),
        eq(localNutritionDailySummaries.timezone, timezone),
      ),
    )
    .run();
}
