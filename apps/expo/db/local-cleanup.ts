import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { getLocalDb } from './client';
import {
  localNutritionDailySummaries,
  localWhoopData,
  localWorkoutExercises,
  localWorkouts,
  localWorkoutSets,
} from './local-schema';

export async function cleanupStaleLocalData(userId: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);

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

  const staleTemplateDrafts = db
    .select({ id: localWorkouts.id })
    .from(localWorkouts)
    .where(
      and(
        eq(localWorkouts.userId, userId),
        eq(localWorkouts.isDeleted, false),
        isNull(localWorkouts.completedAt),
        eq(localWorkouts.syncStatus, 'local'),
        isNotNull(localWorkouts.templateId),
        isNull(localWorkouts.programCycleId),
        isNull(localWorkouts.cycleWorkoutId),
        lt(localWorkouts.updatedAt, twelveHoursAgo),
      ),
    )
    .all();

  const staleWorkoutIds = staleTemplateDrafts.map((row) => row.id);
  if (staleWorkoutIds.length === 0) return;

  const staleExerciseRows = db
    .select({ id: localWorkoutExercises.id })
    .from(localWorkoutExercises)
    .where(inArray(localWorkoutExercises.workoutId, staleWorkoutIds))
    .all();
  const staleExerciseIds = staleExerciseRows.map((row) => row.id);

  const deletedAt = new Date(now);
  if (staleExerciseIds.length > 0) {
    db.update(localWorkoutSets)
      .set({ isDeleted: true, updatedAt: deletedAt })
      .where(inArray(localWorkoutSets.workoutExerciseId, staleExerciseIds))
      .run();
  }

  db.update(localWorkoutExercises)
    .set({ isDeleted: true, updatedAt: deletedAt })
    .where(inArray(localWorkoutExercises.workoutId, staleWorkoutIds))
    .run();

  db.update(localWorkouts)
    .set({ isDeleted: true, syncStatus: 'local', updatedAt: deletedAt })
    .where(inArray(localWorkouts.id, staleWorkoutIds))
    .run();
}
