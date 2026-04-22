/* oxlint-disable no-unused-vars */
import type { WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { and, eq } from 'drizzle-orm';
import {
  whoopBodyMeasurement,
  whoopCycle,
  whoopProfile,
  whoopRecovery,
  whoopSleep,
  whoopWorkout,
} from '@strength/db';
import { forceRefreshAccessToken, getValidAccessToken } from './token-rotation';
import {
  fetchBodyMeasurements,
  fetchCycles,
  fetchRecoveries,
  fetchSleep,
  fetchWorkouts,
  getWhoopProfile,
  type WhoopBodyMeasurement,
  type WhoopCycle,
  type WhoopProfile,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopWorkout,
} from './api';

export interface SyncResult {
  profile: number;
  workouts: number;
  recovery: number;
  cycles: number;
  sleep: number;
  bodyMeasurements: number;
  errors: string[];
}

function getScoreTier(score: number): 'low' | 'medium' | 'high' {
  if (score < 40) return 'low';
  if (score < 70) return 'medium';
  return 'high';
}

function getSleepQualityTier(performance: number): 'poor' | 'fair' | 'good' | 'excellent' {
  if (performance < 50) return 'poor';
  if (performance < 70) return 'fair';
  if (performance < 85) return 'good';
  return 'excellent';
}

export async function upsertWhoopProfile(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  profile: WhoopProfile,
): Promise<number> {
  const existing = await db
    .select({ id: whoopProfile.id })
    .from(whoopProfile)
    .where(eq(whoopProfile.userId, userId))
    .get();

  const values = {
    whoopUserId: String(profile.user_id),
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    rawData: JSON.stringify(profile),
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(whoopProfile).set(values).where(eq(whoopProfile.id, existing.id));
    return 0;
  }

  await db.insert(whoopProfile).values({
    userId,
    ...values,
    createdAt: new Date(),
  });
  return 1;
}

export async function upsertWhoopWorkout(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  workout: WhoopWorkout,
): Promise<number> {
  const existing = await db
    .select({ id: whoopWorkout.id })
    .from(whoopWorkout)
    .where(eq(whoopWorkout.whoopWorkoutId, workout.id))
    .get();

  const zoneDurations = workout.score?.zone_durations;
  const values = {
    userId,
    whoopWorkoutId: workout.id,
    start: new Date(workout.start),
    end: new Date(workout.end),
    timezoneOffset: workout.timezone_offset,
    sportName: workout.sport_name,
    scoreState: workout.score_state,
    score: workout.score ? JSON.stringify(workout.score) : null,
    during: workout.during ? JSON.stringify(workout.during) : null,
    zoneDuration: zoneDurations ? JSON.stringify(zoneDurations) : null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(whoopWorkout).set(values).where(eq(whoopWorkout.id, existing.id));
    return 0;
  }

  await db.insert(whoopWorkout).values({
    ...values,
    createdAt: new Date(),
  });
  return 1;
}

export async function deleteWhoopWorkout(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  whoopWorkoutId: string,
): Promise<number> {
  const existing = await db
    .select({ id: whoopWorkout.id })
    .from(whoopWorkout)
    .where(and(eq(whoopWorkout.userId, userId), eq(whoopWorkout.whoopWorkoutId, whoopWorkoutId)))
    .get();

  if (!existing) {
    return 0;
  }

  await db.delete(whoopWorkout).where(eq(whoopWorkout.id, existing.id));
  return 1;
}

export async function upsertWhoopRecovery(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  recovery: WhoopRecovery,
): Promise<number> {
  const whoopRecoveryId =
    recovery.sleep_id ?? (recovery.cycle_id != null ? String(recovery.cycle_id) : null);
  if (!whoopRecoveryId) {
    return 0;
  }

  const existing = await db
    .select({ id: whoopRecovery.id })
    .from(whoopRecovery)
    .where(eq(whoopRecovery.whoopRecoveryId, whoopRecoveryId))
    .get();

  const recoveryScore = recovery.score?.recovery_score ?? null;
  const values = {
    userId,
    whoopRecoveryId,
    cycleId: recovery.cycle_id != null ? String(recovery.cycle_id) : null,
    date: new Date(recovery.created_at ?? recovery.updated_at ?? Date.now()),
    recoveryScore,
    hrvRmssdMilli: recovery.score?.hrv_rmssd_milli ?? null,
    hrvRmssdBaseline: null,
    restingHeartRate: recovery.score?.resting_heart_rate ?? null,
    restingHeartRateBaseline: null,
    respiratoryRate: recovery.score?.respiratory_rate ?? null,
    respiratoryRateBaseline: null,
    rawData: JSON.stringify(recovery),
    recoveryScoreTier: recoveryScore != null ? getScoreTier(recoveryScore) : null,
    timezoneOffset: null,
    webhookReceivedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(whoopRecovery).set(values).where(eq(whoopRecovery.id, existing.id));
    return 0;
  }

  await db.insert(whoopRecovery).values({
    ...values,
    createdAt: new Date(),
  });
  return 1;
}

export async function deleteWhoopRecovery(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  whoopRecoveryId: string,
): Promise<number> {
  const existing = await db
    .select({ id: whoopRecovery.id })
    .from(whoopRecovery)
    .where(
      and(eq(whoopRecovery.userId, userId), eq(whoopRecovery.whoopRecoveryId, whoopRecoveryId)),
    )
    .get();

  if (!existing) {
    return 0;
  }

  await db.delete(whoopRecovery).where(eq(whoopRecovery.id, existing.id));
  return 1;
}

export async function upsertWhoopCycle(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  cycle: WhoopCycle,
): Promise<number> {
  const existing = await db
    .select({ id: whoopCycle.id })
    .from(whoopCycle)
    .where(eq(whoopCycle.whoopCycleId, cycle.id))
    .get();

  const score = cycle.score;
  const values = {
    userId,
    whoopCycleId: cycle.id,
    start: new Date(cycle.start),
    end: new Date(cycle.end),
    timezoneOffset: cycle.timezone_offset,
    dayStrain: score?.strain ?? null,
    averageHeartRate: score?.average_heart_rate ?? null,
    maxHeartRate: score?.max_heart_rate ?? null,
    kilojoule: score?.kilojoule ?? null,
    percentRecorded: score?.percent_recorded ?? null,
    distanceMeter: score?.distance_meter ?? null,
    altitudeGainMeter: score?.altitude_gain_meter ?? null,
    altitudeChangeMeter: score?.altitude_change_meter ?? null,
    rawData: JSON.stringify(cycle),
    webhookReceivedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(whoopCycle).set(values).where(eq(whoopCycle.id, existing.id));
    return 0;
  }

  await db.insert(whoopCycle).values({
    ...values,
    createdAt: new Date(),
  });
  return 1;
}

export async function upsertWhoopSleep(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  sleep: WhoopSleep,
): Promise<number> {
  const existing = await db
    .select({ id: whoopSleep.id })
    .from(whoopSleep)
    .where(eq(whoopSleep.whoopSleepId, sleep.id))
    .get();

  const stageSummary = sleep.score?.stage_summary;
  const sleepNeeded = sleep.score?.sleep_needed;
  const totalSleepTimeMilli =
    (stageSummary?.total_light_sleep_time_milli ?? 0) +
    (stageSummary?.total_slow_wave_sleep_time_milli ?? 0) +
    (stageSummary?.total_rem_sleep_time_milli ?? 0);

  const values = {
    userId,
    whoopSleepId: sleep.id,
    start: new Date(sleep.start),
    end: new Date(sleep.end),
    timezoneOffset: sleep.timezone_offset,
    sleepPerformancePercentage: sleep.score?.sleep_performance_percentage ?? null,
    totalSleepTimeMilli: totalSleepTimeMilli > 0 ? totalSleepTimeMilli : null,
    sleepEfficiencyPercentage: sleep.score?.sleep_efficiency_percentage ?? null,
    slowWaveSleepTimeMilli: stageSummary?.total_slow_wave_sleep_time_milli ?? null,
    remSleepTimeMilli: stageSummary?.total_rem_sleep_time_milli ?? null,
    lightSleepTimeMilli: stageSummary?.total_light_sleep_time_milli ?? null,
    wakeTimeMilli: stageSummary?.total_awake_time_milli ?? null,
    arousalTimeMilli: null,
    disturbanceCount: stageSummary?.disturbance_count ?? null,
    sleepLatencyMilli: null,
    sleepConsistencyPercentage: sleep.score?.sleep_consistency_percentage ?? null,
    sleepNeedBaselineMilli: sleepNeeded?.baseline_milli ?? null,
    sleepNeedFromSleepDebtMilli: sleepNeeded?.need_from_sleep_debt_milli ?? null,
    sleepNeedFromRecentStrainMilli: sleepNeeded?.need_from_recent_strain_milli ?? null,
    sleepNeedFromRecentNapMilli: sleepNeeded?.need_from_recent_nap_milli ?? null,
    rawData: JSON.stringify(sleep),
    sleepQualityTier:
      sleep.score?.sleep_performance_percentage != null
        ? getSleepQualityTier(sleep.score.sleep_performance_percentage)
        : null,
    webhookReceivedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(whoopSleep).set(values).where(eq(whoopSleep.id, existing.id));
    return 0;
  }

  await db.insert(whoopSleep).values({
    ...values,
    createdAt: new Date(),
  });
  return 1;
}

export async function deleteWhoopSleep(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  whoopSleepId: string,
): Promise<number> {
  const existing = await db
    .select({ id: whoopSleep.id })
    .from(whoopSleep)
    .where(and(eq(whoopSleep.userId, userId), eq(whoopSleep.whoopSleepId, whoopSleepId)))
    .get();

  if (!existing) {
    return 0;
  }

  await db.delete(whoopSleep).where(eq(whoopSleep.id, existing.id));
  return 1;
}

export async function upsertWhoopBodyMeasurement(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  measurement: WhoopBodyMeasurement,
): Promise<number> {
  const measurementId =
    measurement.id ??
    measurement.measurement_date ??
    `${measurement.height_meter}:${measurement.weight_kilogram}:${measurement.max_heart_rate ?? 'na'}`;

  const existing = await db
    .select({ id: whoopBodyMeasurement.id })
    .from(whoopBodyMeasurement)
    .where(eq(whoopBodyMeasurement.whoopMeasurementId, measurementId))
    .get();

  const values = {
    userId,
    whoopMeasurementId: measurementId,
    heightMeter: measurement.height_meter,
    weightKilogram: measurement.weight_kilogram,
    maxHeartRate: measurement.max_heart_rate ?? null,
    measurementDate: measurement.measurement_date ? new Date(measurement.measurement_date) : null,
    rawData: JSON.stringify(measurement),
    webhookReceivedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(whoopBodyMeasurement)
      .set(values)
      .where(eq(whoopBodyMeasurement.id, existing.id));
    return 0;
  }

  await db.insert(whoopBodyMeasurement).values({
    ...values,
    createdAt: new Date(),
  });
  return 1;
}

async function syncWorkouts(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  workouts: WhoopWorkout[],
): Promise<number> {
  let count = 0;
  for (const workout of workouts) {
    count += await upsertWhoopWorkout(db, userId, workout);
  }
  return count;
}

async function syncRecoveries(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  recoveries: WhoopRecovery[],
): Promise<number> {
  let count = 0;
  for (const recovery of recoveries) {
    count += await upsertWhoopRecovery(db, userId, recovery);
  }
  return count;
}

async function syncCycles(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  cycles: WhoopCycle[],
): Promise<number> {
  let count = 0;
  for (const cycle of cycles) {
    count += await upsertWhoopCycle(db, userId, cycle);
  }
  return count;
}

async function syncSleepRecords(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  sleepRecords: WhoopSleep[],
): Promise<number> {
  let count = 0;
  for (const sleep of sleepRecords) {
    count += await upsertWhoopSleep(db, userId, sleep);
  }
  return count;
}

async function syncBodyMeasurements(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  measurements: WhoopBodyMeasurement[],
): Promise<number> {
  let count = 0;
  for (const measurement of measurements) {
    count += await upsertWhoopBodyMeasurement(db, userId, measurement);
  }
  return count;
}

export async function syncAllWhoopData(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    profile: 0,
    workouts: 0,
    recovery: 0,
    cycles: 0,
    sleep: 0,
    bodyMeasurements: 0,
    errors: [],
  };

  const tokenResult = await getValidAccessToken(db, env, userId);
  if (!tokenResult.token) {
    result.errors.push(`Token error: ${tokenResult.error}`);
    return result;
  }

  let accessToken = tokenResult.token;

  async function runWithFreshToken<T>(
    label: string,
    action: (token: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await action(accessToken);
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && e.status === 401) {
        const refreshed = await forceRefreshAccessToken(db, env, userId);
        if (!refreshed.token) {
          throw new Error(`${label} token refresh failed: ${refreshed.error ?? 'Unknown error'}`);
        }

        accessToken = refreshed.token;
        return action(accessToken);
      }

      throw e;
    }
  }

  try {
    try {
      const profile = await runWithFreshToken('Profile', getWhoopProfile);
      result.profile = await upsertWhoopProfile(db, userId, profile);
    } catch (e) {
      result.errors.push(`Profile: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const workouts = await runWithFreshToken('Workouts', fetchWorkouts);
      result.workouts = await syncWorkouts(db, userId, workouts);
    } catch (e) {
      result.errors.push(`Workouts: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const recoveries = await runWithFreshToken('Recovery', fetchRecoveries);
      result.recovery = await syncRecoveries(db, userId, recoveries);
    } catch (e) {
      result.errors.push(`Recovery: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const cycles = await runWithFreshToken('Cycles', fetchCycles);
      result.cycles = await syncCycles(db, userId, cycles);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown';
      if (e && typeof e === 'object' && 'status' in e && e.status === 403) {
        console.log('[WHOOP Sync] Cycles scope not granted, skipping');
      } else {
        result.errors.push(`Cycles: ${msg}`);
      }
    }

    try {
      const sleep = await runWithFreshToken('Sleep', fetchSleep);
      result.sleep = await syncSleepRecords(db, userId, sleep);
    } catch (e) {
      result.errors.push(`Sleep: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const measurements = await runWithFreshToken('Body Measurements', fetchBodyMeasurements);
      result.bodyMeasurements = await syncBodyMeasurements(db, userId, measurements);
    } catch (e) {
      result.errors.push(`Body Measurements: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  } catch (e) {
    result.errors.push(`Sync error: ${e instanceof Error ? e.message : 'Unknown'}`);
  }

  return result;
}
