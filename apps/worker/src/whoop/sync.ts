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
import { getValidAccessToken } from './token-rotation';
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
          zoneDuration: workout.zone_duration ? JSON.stringify(workout.zone_duration) : null,
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
    try {
      await db
        .insert(whoopRecovery)
        .values({
          userId,
          whoopRecoveryId: recovery.id,
          cycleId: recovery.cycle_id || null,
          date: new Date(recovery.date),
          recoveryScore: recovery.recovery_score,
          hrvRmssdMilli: recovery.hrv_rmssd_milli,
          hrvRmssdBaseline: recovery.hrv_rmssd_baseline,
          restingHeartRate: recovery.resting_heart_rate,
          restingHeartRateBaseline: recovery.resting_heart_rate_baseline,
          respiratoryRate: recovery.respiratory_rate,
          respiratoryRateBaseline: recovery.respiratory_rate_baseline,
          rawData: JSON.stringify(recovery),
          recoveryScoreTier: recovery.recovery_score_tier || getScoreTier(recovery.recovery_score),
          timezoneOffset: recovery.timezone_offset,
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
    try {
      await db
        .insert(whoopCycle)
        .values({
          userId,
          whoopCycleId: cycle.id,
          start: new Date(cycle.start),
          end: new Date(cycle.end),
          timezoneOffset: cycle.timezone_offset,
          dayStrain: cycle.day_strain,
          averageHeartRate: cycle.average_heart_rate,
          maxHeartRate: cycle.max_heart_rate,
          kilojoule: cycle.kilojoule || null,
          percentRecorded: cycle.percent_recorded,
          distanceMeter: cycle.distance_meter || null,
          altitudeGainMeter: cycle.altitude_gain_meter || null,
          altitudeChangeMeter: cycle.altitude_change_meter || null,
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
    try {
      await db
        .insert(whoopSleep)
        .values({
          userId,
          whoopSleepId: sleep.id,
          start: new Date(sleep.start),
          end: new Date(sleep.end),
          timezoneOffset: sleep.timezone_offset,
          sleepPerformancePercentage: sleep.sleep_performance_percentage,
          totalSleepTimeMilli: sleep.total_sleep_time_milli,
          sleepEfficiencyPercentage: sleep.sleep_efficiency_percentage,
          slowWaveSleepTimeMilli: sleep.slow_wave_sleep_time_milli,
          remSleepTimeMilli: sleep.rem_sleep_time_milli,
          lightSleepTimeMilli: sleep.light_sleep_time_milli,
          wakeTimeMilli: sleep.wake_time_milli,
          arousalTimeMilli: sleep.arousal_time_milli,
          disturbanceCount: sleep.disturbance_count,
          sleepLatencyMilli: sleep.sleep_latency_milli,
          sleepConsistencyPercentage: sleep.sleep_consistency_percentage,
          sleepNeedBaselineMilli: sleep.sleep_need_baseline_milli,
          sleepNeedFromSleepDebtMilli: sleep.sleep_need_from_sleep_debt_milli,
          sleepNeedFromRecentStrainMilli: sleep.sleep_need_from_recent_strain_milli,
          sleepNeedFromRecentNapMilli: sleep.sleep_need_from_recent_nap_milli,
          rawData: JSON.stringify(sleep),
          sleepQualityTier:
            sleep.sleep_quality_tier || getSleepQualityTier(sleep.sleep_performance_percentage),
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

  const accessToken = tokenResult.token;

  try {
    try {
      const profile = await getWhoopProfile(accessToken);
      result.profile = await syncProfile(db, userId, profile);
    } catch (e) {
      result.errors.push(`Profile: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const workouts = await fetchWorkouts(accessToken);
      result.workouts = await syncWorkouts(db, userId, workouts);
    } catch (e) {
      result.errors.push(`Workouts: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const recoveries = await fetchRecoveries(accessToken);
      result.recovery = await syncRecoveries(db, userId, recoveries);
    } catch (e) {
      result.errors.push(`Recovery: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const cycles = await fetchCycles(accessToken);
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
      const sleep = await fetchSleep(accessToken);
      result.sleep = await syncSleep(db, userId, sleep);
    } catch (e) {
      result.errors.push(`Sleep: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    try {
      const measurements = await fetchBodyMeasurements(accessToken);
      result.bodyMeasurements = await syncBodyMeasurements(db, userId, measurements);
    } catch (e) {
      result.errors.push(`Body Measurements: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  } catch (e) {
    result.errors.push(`Sync error: ${e instanceof Error ? e.message : 'Unknown'}`);
  }

  return result;
}
