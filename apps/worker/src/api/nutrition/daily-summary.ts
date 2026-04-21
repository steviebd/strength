import { eq, and, gte, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { TrainingContext, WhoopData, MacroTargets } from '../../lib/ai/nutrition-prompts';
import * as schema from '@strength/db';

function getDb(c: any) {
  return drizzle(c.env.DB, { schema });
}

export async function dailySummaryHandler(c: any) {
  const session = await c.get('session');
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);

  const date = c.req.query('date');

  if (!date) {
    return c.json({ error: 'date query parameter is required' }, 400);
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
  }

  const _prefs = await db
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .get();

  const _timezone = 'UTC';

  const entries = await db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.userId, userId),
        eq(schema.nutritionEntries.date, date),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .orderBy(schema.nutritionEntries.createdAt)
    .all();

  const bodyStats = await db
    .select()
    .from(schema.userBodyStats)
    .where(eq(schema.userBodyStats.userId, userId))
    .get();

  const trainingCtxRow = await db
    .select()
    .from(schema.nutritionTrainingContext)
    .where(
      and(
        eq(schema.nutritionTrainingContext.userId, userId),
        eq(schema.nutritionTrainingContext.date, date),
      ),
    )
    .get();

  const trainingContext: TrainingContext | null = trainingCtxRow
    ? {
        type: trainingCtxRow.trainingType as TrainingContext['type'],
        customLabel: trainingCtxRow.customLabel ?? undefined,
      }
    : null;

  const targetDate = new Date(date + 'T00:00:00Z');
  const startOfDay = new Date(targetDate);
  const endOfDay = new Date(targetDate);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const recovery = await db
    .select()
    .from(schema.whoopRecovery)
    .where(
      and(
        eq(schema.whoopRecovery.userId, userId),
        gte(schema.whoopRecovery.date, startOfDay),
        lte(schema.whoopRecovery.date, endOfDay),
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
        lte(schema.whoopCycle.start, endOfDay),
      ),
    )
    .get();

  const whoopRecovery: WhoopData | null = recovery
    ? {
        recoveryScore: recovery.recoveryScore ?? null,
        recoveryStatus: recovery.recoveryScoreTier ?? null,
        hrv: recovery.hrvRmssdMilli ?? null,
        restingHeartRate: recovery.restingHeartRate ?? null,
        caloriesBurned: null,
        totalStrain: null,
      }
    : null;

  const whoopCycle = cycle
    ? {
        recoveryScore: null,
        recoveryStatus: null,
        hrv: null,
        restingHeartRate: null,
        caloriesBurned: cycle.dayStrain ? Math.round(cycle.dayStrain * 10) : null,
        totalStrain: cycle.dayStrain ?? null,
      }
    : null;

  const totalCalories = entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
  const totalProteinG = entries.reduce((sum, e) => sum + (e.proteinG ?? 0), 0);
  const totalCarbsG = entries.reduce((sum, e) => sum + (e.carbsG ?? 0), 0);
  const totalFatG = entries.reduce((sum, e) => sum + (e.fatG ?? 0), 0);

  let targets: MacroTargets = {
    calories: bodyStats?.targetCalories ?? 2500,
    proteinG: bodyStats?.targetProteinG ?? 150,
    carbsG: bodyStats?.targetCarbsG ?? 250,
    fatG: bodyStats?.targetFatG ?? 80,
  };

  if (bodyStats?.bodyweightKg) {
    const proteinG = Math.round(bodyStats.bodyweightKg * 2);
    const fatG = Math.round(bodyStats.bodyweightKg * 0.8);
    const proteinCals = proteinG * 4;
    const fatCals = fatG * 9;
    const remainingCals = (bodyStats?.targetCalories ?? 2500) - proteinCals - fatCals;
    const carbsG = Math.round(remainingCals / 4);

    let multiplier = 1;
    if (trainingContext?.type === 'powerlifting') {
      multiplier = 1.1;
    } else if (trainingContext?.type === 'cardio') {
      multiplier = 1.05;
    } else if (trainingContext?.type === 'rest_day') {
      multiplier = 0.95;
    }

    if (!bodyStats?.targetCalories) {
      targets = {
        calories: Math.round(2500 * multiplier),
        proteinG,
        carbsG,
        fatG,
      };
    }
  }

  return c.json({
    entries: entries.map((e) => ({
      id: e.id,
      name: e.name,
      mealType: e.mealType,
      calories: e.calories,
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
      loggedAt: e.loggedAt,
    })),
    totals: {
      calories: totalCalories,
      proteinG: totalProteinG,
      carbsG: totalCarbsG,
      fatG: totalFatG,
    },
    targets,
    bodyweightKg: bodyStats?.bodyweightKg ?? null,
    trainingContext,
    whoopRecovery,
    whoopCycle,
    programSession: null,
  });
}
