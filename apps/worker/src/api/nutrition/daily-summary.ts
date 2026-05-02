import { eq, and, gte, lt } from 'drizzle-orm';
import type { TrainingContext, MacroTargets } from '../../lib/ai/nutrition-prompts';
import * as schema from '@strength/db';
import { createHandler } from '../auth';
import { getUtcRangeForLocalDate, resolveUserTimezone } from '../../lib/timezone';
import { getWhoopDataForDay } from '../../lib/whoop-queries';
import { calculateMacroTargets } from '../../lib/nutrition';

type TargetStrategy = 'manual' | 'bodyweight' | 'default';

export const dailySummaryHandler = createHandler(async (c, { userId, db }) => {
  const date = c.req.query('date');

  if (!date) {
    return c.json({ error: 'date query parameter is required' }, 400);
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
  }

  const timezoneResult = await resolveUserTimezone(db, userId, c.req.query('timezone'));
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }

  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(
    date,
    timezoneResult.timezone,
  );

  const [entries, bodyStats, trainingCtxRow, whoopData] = await Promise.all([
    db
      .select()
      .from(schema.nutritionEntries)
      .where(
        and(
          eq(schema.nutritionEntries.userId, userId),
          gte(schema.nutritionEntries.loggedAt, startOfDay),
          lt(schema.nutritionEntries.loggedAt, endOfDay),
          eq(schema.nutritionEntries.isDeleted, false),
        ),
      )
      .orderBy(schema.nutritionEntries.createdAt)
      .all(),
    db.select().from(schema.userBodyStats).where(eq(schema.userBodyStats.userId, userId)).get(),
    db
      .select()
      .from(schema.nutritionTrainingContext)
      .where(
        and(
          eq(schema.nutritionTrainingContext.userId, userId),
          gte(schema.nutritionTrainingContext.createdAt, startOfDay),
          lt(schema.nutritionTrainingContext.createdAt, endOfDay),
        ),
      )
      .get(),
    getWhoopDataForDay(db, userId, date, timezoneResult.timezone),
  ]);

  const trainingContext: TrainingContext | null = trainingCtxRow
    ? {
        type: trainingCtxRow.trainingType as TrainingContext['type'],
        customLabel: trainingCtxRow.customLabel ?? undefined,
      }
    : null;

  const whoopRecovery =
    whoopData.recoveryScore !== null
      ? {
          recoveryScore: whoopData.recoveryScore,
          recoveryStatus: whoopData.recoveryStatus,
          hrv: whoopData.hrv,
          restingHeartRate: whoopData.restingHeartRate,
          caloriesBurned: null,
          totalStrain: null,
        }
      : null;

  const whoopCycle =
    whoopData.totalStrain !== null
      ? {
          recoveryScore: null,
          recoveryStatus: null,
          hrv: null,
          restingHeartRate: null,
          caloriesBurned: whoopData.caloriesBurned,
          totalStrain: whoopData.totalStrain,
        }
      : null;

  const totalCalories = entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
  const totalProteinG = entries.reduce((sum, e) => sum + (e.proteinG ?? 0), 0);
  const totalCarbsG = entries.reduce((sum, e) => sum + (e.carbsG ?? 0), 0);
  const totalFatG = entries.reduce((sum, e) => sum + (e.fatG ?? 0), 0);

  const manualTargetsProvided = [
    bodyStats?.targetCalories,
    bodyStats?.targetProteinG,
    bodyStats?.targetCarbsG,
    bodyStats?.targetFatG,
  ].some((value) => value !== null && value !== undefined);

  let calorieMultiplier = 1;
  if (trainingContext?.type === 'powerlifting') {
    calorieMultiplier = 1.1;
  } else if (trainingContext?.type === 'cardio') {
    calorieMultiplier = 1.05;
  } else if (trainingContext?.type === 'rest_day') {
    calorieMultiplier = 0.95;
  }

  let targets: MacroTargets;
  let targetStrategy: TargetStrategy;
  let targetExplanation: string;

  if (manualTargetsProvided) {
    targets = {
      calories: bodyStats?.targetCalories ?? 2500,
      proteinG: bodyStats?.targetProteinG ?? 150,
      carbsG: bodyStats?.targetCarbsG ?? 250,
      fatG: bodyStats?.targetFatG ?? 80,
    };
    targetStrategy = 'manual';
    targetExplanation = 'Targets are using the manual nutrition values saved in your profile.';
  } else if (bodyStats?.bodyweightKg) {
    targets = calculateMacroTargets(bodyStats.bodyweightKg, trainingContext?.type ?? null, 2500);
    targetStrategy = 'bodyweight';
    targetExplanation = `Targets are estimated from ${bodyStats.bodyweightKg} kg bodyweight, with protein at 2.0 g/kg, fat at 0.8 g/kg, and carbs using the remaining calories.`;
  } else {
    targets = {
      calories: Math.round(2500 * calorieMultiplier),
      proteinG: 150,
      carbsG: 250,
      fatG: 80,
    };
    targetStrategy = 'default';
    targetExplanation =
      'Targets are using the app defaults until bodyweight or manual targets are set.';
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
    targetMeta: {
      strategy: targetStrategy,
      explanation: targetExplanation,
      calorieMultiplier,
    },
    bodyweightKg: bodyStats?.bodyweightKg ?? null,
    trainingContext,
    whoopRecovery,
    whoopCycle,
    whoopUpdatedAt:
      Math.max(
        whoopData.recoveryUpdatedAt?.getTime() ?? 0,
        whoopData.cycleUpdatedAt?.getTime() ?? 0,
      ) || null,
    programSession: null,
  });
});
