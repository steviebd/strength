import { and, eq, lt } from 'drizzle-orm';
import { getLocalDb } from './client';
import { localNutritionDailySummaries, localWhoopData } from './local-schema';

export async function cleanupStaleLocalData(userId: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // Delete nutrition daily summaries older than 7 days
  db.delete(localNutritionDailySummaries)
    .where(
      and(
        eq(localNutritionDailySummaries.userId, userId),
        lt(localNutritionDailySummaries.hydratedAt, sevenDaysAgo),
      ),
    )
    .run();

  // Delete WHOOP data older than 7 days
  db.delete(localWhoopData)
    .where(and(eq(localWhoopData.userId, userId), lt(localWhoopData.hydratedAt, sevenDaysAgo)))
    .run();
}
