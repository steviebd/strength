import { eq, and, gte, lt } from 'drizzle-orm';
import * as schema from '@strength/db';
import type { WhoopData } from './ai/nutrition-prompts';
import { getUtcRangeForLocalDate } from './timezone';

export async function getWhoopDataForDay(
  db: any,
  userId: string,
  date: string,
  timezone: string,
): Promise<WhoopData & { recoveryUpdatedAt: Date | null; cycleUpdatedAt: Date | null }> {
  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(date, timezone);

  const recovery = await db
    .select()
    .from(schema.whoopRecovery)
    .where(
      and(
        eq(schema.whoopRecovery.userId, userId),
        gte(schema.whoopRecovery.date, startOfDay),
        lt(schema.whoopRecovery.date, endOfDay),
      ),
    )
    .get();

  const cycle = await db
    .select()
    .from(schema.whoopCycle)
    .where(
      and(
        eq(schema.whoopCycle.userId, userId),
        gte(schema.whoopCycle.start, startOfDay),
        lt(schema.whoopCycle.start, endOfDay),
      ),
    )
    .get();

  return {
    recoveryScore: recovery?.recoveryScore ?? null,
    recoveryStatus: recovery?.recoveryScoreTier ?? null,
    hrv: recovery?.hrvRmssdMilli ?? null,
    restingHeartRate: recovery?.restingHeartRate ?? null,
    caloriesBurned: cycle?.dayStrain ? Math.round(cycle.dayStrain * 10) : null,
    totalStrain: cycle?.dayStrain ?? null,
    recoveryUpdatedAt: recovery?.updatedAt ?? null,
    cycleUpdatedAt: cycle?.updatedAt ?? null,
  };
}
