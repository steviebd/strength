/* oxlint-disable no-unused-vars */
import type { WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { eq } from 'drizzle-orm';
import {
  whoopProfile,
  whoopWorkout,
  whoopRecovery,
  whoopCycle,
  whoopSleep,
  whoopBodyMeasurement,
} from '@strength/db';
import { forceRefreshAccessToken, getValidAccessToken } from './token-rotation';
import {
  fetchWorkouts,
  fetchRecoveries,
  fetchCycles,
  fetchSleep,
  fetchBodyMeasurements,
  WhoopWorkout,
  WhoopRecovery,
  WhoopCycle,
  WhoopSleep,
  WhoopBodyMeasurement,
  WhoopProfile,
} from './api';
import { getWhoopProfile } from './api';

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

async function syncProfile(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  profile: WhoopProfile,
): Promise<number> {
  const existing = await db
    .select()
    .from(whoopProfile)
    .where(eq(whoopProfile.userId, userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(whoopProfile)
      .set({
        whoopUserId: String(profile.user_id),
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        rawData: JSON.stringify(profile),
        updatedAt: new Date(),
      })
      .where(eq(whoopProfile.id, existing[0].id));
    return 0;
  } else {
    await db.insert(whoopProfile).values({
      userId,
      whoopUserId: String(profile.user_id),
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      rawData: JSON.stringify(profile),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return 1;
  }
}

async function syncWorkouts(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  workouts: WhoopWorkout[],
): Promise<number> {
  if (workouts.length === 0) return 0;

  let newCount = 0;
  for (const workout of workouts) {
    const zoneDurations = workout.score?.zone_durations;
    try {
      await db
        .insert(whoopWorkout)
        .values({
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
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      newCount++;
    } catch (_e) {
      // Skip duplicates
    }
  }
  return newCount;
}

async function syncRecoveries(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  recoveries: WhoopRecovery[],
): Promise<number> {
  if (recoveries.length === 0) return 0;

  let newCount = 0;
  for (const recovery of recoveries) {
    const whoopRecoveryId = recovery.sleep_id ?? recovery.cycle_id;
    const recoveryScore = recovery.score?.recovery_score ?? null;
    const restingHeartRate = recovery.score?.resting_heart_rate ?? null;
    const hrvRmssdMilli = recovery.score?.hrv_rmssd_milli ?? null;

    if (!whoopRecoveryId) {
      continue;
    }

    try {
      await db
        .insert(whoopRecovery)
        .values({
          userId,
          whoopRecoveryId: String(whoopRecoveryId),
          cycleId: recovery.cycle_id || null,
          date: new Date(recovery.created_at ?? recovery.updated_at ?? Date.now()),
          recoveryScore,
          hrvRmssdMilli,
          hrvRmssdBaseline: null,
          restingHeartRate,
          restingHeartRateBaseline: null,
          respiratoryRate: null,
          respiratoryRateBaseline: null,
          rawData: JSON.stringify(recovery),
          recoveryScoreTier: recoveryScore != null ? getScoreTier(recoveryScore) : null,
          timezoneOffset: null,
          webhookReceivedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      newCount++;
    } catch (_e) {
      // Skip duplicates
    }
  }
  return newCount;
}

async function syncCycles(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  cycles: WhoopCycle[],
): Promise<number> {
  if (cycles.length === 0) return 0;

  let newCount = 0;
  for (const cycle of cycles) {
    const score = cycle.score;
    try {
      await db
        .insert(whoopCycle)
        .values({
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
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      newCount++;
    } catch (_e) {
      // Skip duplicates
    }
  }
  return newCount;
}

async function syncSleep(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  records: WhoopSleep[],
): Promise<number> {
  if (records.length === 0) return 0;

  let newCount = 0;
  for (const sleep of records) {
    const stageSummary = sleep.score?.stage_summary;
    const sleepNeeded = sleep.score?.sleep_needed;
    const totalSleepTimeMilli =
      (stageSummary?.total_light_sleep_time_milli ?? 0) +
      (stageSummary?.total_slow_wave_sleep_time_milli ?? 0) +
      (stageSummary?.total_rem_sleep_time_milli ?? 0);

    try {
      await db
        .insert(whoopSleep)
        .values({
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
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      newCount++;
    } catch (_e) {
      // Skip duplicates
    }
  }
  return newCount;
}

async function syncBodyMeasurements(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  measurements: WhoopBodyMeasurement[],
): Promise<number> {
  if (measurements.length === 0) return 0;

  let newCount = 0;
  for (const measurement of measurements) {
    try {
      await db
        .insert(whoopBodyMeasurement)
        .values({
          userId,
          whoopMeasurementId: measurement.id,
          heightMeter: measurement.height_meter,
          weightKilogram: measurement.weight_kilogram,
          maxHeartRate: measurement.max_heart_rate || null,
          measurementDate: new Date(measurement.measurement_date),
          rawData: JSON.stringify(measurement),
          webhookReceivedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      newCount++;
    } catch (_e) {
      // Skip duplicates
    }
  }
  return newCount;
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
      result.profile = await syncProfile(db, userId, profile);
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
      result.sleep = await syncSleep(db, userId, sleep);
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
