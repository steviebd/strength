import { eq, sql } from 'drizzle-orm';
import * as schema from '@strength/db';

export async function getWorkoutAggregates(db: any, workoutId: string) {
  return db
    .select({
      totalSets: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSets.isComplete} = 1 THEN 1 ELSE 0 END), 0)`,
      totalVolume: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSets.isComplete} = 1 AND ${schema.workoutSets.weight} > 0 THEN ${schema.workoutSets.weight} * ${schema.workoutSets.reps} ELSE 0 END), 0)`,
      exerciseCount: sql<number>`COUNT(DISTINCT ${schema.workoutExercises.id})`,
    })
    .from(schema.workoutExercises)
    .leftJoin(
      schema.workoutSets,
      eq(schema.workoutExercises.id, schema.workoutSets.workoutExerciseId),
    )
    .where(eq(schema.workoutExercises.workoutId, workoutId))
    .get();
}
