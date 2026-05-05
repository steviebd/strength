import type { WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { and, eq, max, sql } from 'drizzle-orm';
import { chunkedInsert } from '@strength/db';
import {
  whoopBodyMeasurement,
  whoopCycle,
  whoopProfile,
  whoopRecovery,
  whoopSleep,
  whoopWorkout,
} from '@strength/db';
import {
  fetchBodyMeasurements as fetchBodyMeasurementsWithToken,
  fetchCycles as fetchCyclesWithToken,
  fetchRecoveries as fetchRecoveriesWithToken,
  fetchSleep as fetchSleepWithToken,
  fetchWorkouts as fetchWorkoutsWithToken,
  getWhoopProfile as getWhoopProfileWithToken,
} from './client';
import { isWhoopAuthError } from './errors';
import {
  type WhoopBodyMeasurement,
  type WhoopCycle,
  type WhoopProfile,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopWorkout,
} from './api';

interface SyncResult {
  profile: number;
  workouts: number;
  recovery: number;
  cycles: number;
  sleep: number;
  bodyMeasurements: number;
  errors: string[];
}

const DAYS_BACK = 365;
const OVERLAP_DAYS = 7;

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

export function getSyncStartDate(
  latestDate: Date | number | null | undefined,
  isInitialSync: boolean,
): Date {
  const maxLookback = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000);
  const date =
    latestDate instanceof Date ? latestDate : latestDate != null ? new Date(latestDate) : null;

  if (isInitialSync || !date) {
    return maxLookback;
  }

  const withOverlap = new Date(date.getTime() - OVERLAP_DAYS * 24 * 60 * 60 * 1000);
  return withOverlap > maxLookback ? withOverlap : maxLookback;
}

export async function upsertWhoopProfile(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  profile: WhoopProfile,
): Promise<number> {
  const now = new Date();
  const values = {
    userId,
    whoopUserId: String(profile.user_id),
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    rawData: JSON.stringify(profile),
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insert(whoopProfile)
    .values(values)
    .onConflictDoUpdate({
      target: whoopProfile.whoopUserId,
      set: {
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        rawData: JSON.stringify(profile),
        updatedAt: now,
      },
    });

  return 1;
}

export async function upsertWhoopWorkout(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  workout: WhoopWorkout,
): Promise<number> {
  const now = new Date();
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
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insert(whoopWorkout)
    .values(values)
    .onConflictDoUpdate({
      target: whoopWorkout.whoopWorkoutId,
      set: {
        userId,
        start: new Date(workout.start),
        end: new Date(workout.end),
        timezoneOffset: workout.timezone_offset,
        sportName: workout.sport_name,
        scoreState: workout.score_state,
        score: workout.score ? JSON.stringify(workout.score) : null,
        during: workout.during ? JSON.stringify(workout.during) : null,
        zoneDuration: zoneDurations ? JSON.stringify(zoneDurations) : null,
        updatedAt: now,
      },
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

  const now = new Date();
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
    webhookReceivedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insert(whoopRecovery)
    .values(values)
    .onConflictDoUpdate({
      target: whoopRecovery.whoopRecoveryId,
      set: {
        userId,
        cycleId: recovery.cycle_id != null ? String(recovery.cycle_id) : null,
        date: new Date(recovery.created_at ?? recovery.updated_at ?? Date.now()),
        recoveryScore,
        hrvRmssdMilli: recovery.score?.hrv_rmssd_milli ?? null,
        restingHeartRate: recovery.score?.resting_heart_rate ?? null,
        respiratoryRate: recovery.score?.respiratory_rate ?? null,
        rawData: JSON.stringify(recovery),
        recoveryScoreTier: recoveryScore != null ? getScoreTier(recoveryScore) : null,
        webhookReceivedAt: now,
        updatedAt: now,
      },
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
  const now = new Date();
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
    webhookReceivedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insert(whoopCycle)
    .values(values)
    .onConflictDoUpdate({
      target: whoopCycle.whoopCycleId,
      set: {
        userId,
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
        webhookReceivedAt: now,
        updatedAt: now,
      },
    });

  return 1;
}

export async function upsertWhoopSleep(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  sleep: WhoopSleep,
): Promise<number> {
  const now = new Date();
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
    webhookReceivedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insert(whoopSleep)
    .values(values)
    .onConflictDoUpdate({
      target: whoopSleep.whoopSleepId,
      set: {
        userId,
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
        disturbanceCount: stageSummary?.disturbance_count ?? null,
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
        webhookReceivedAt: now,
        updatedAt: now,
      },
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

// Batched sync helpers

async function syncWorkouts(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  workouts: WhoopWorkout[],
): Promise<number> {
  if (workouts.length === 0) return 0;

  const rows = workouts.map((workout) => {
    const zoneDurations = workout.score?.zone_durations;
    return {
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
    };
  });

  return chunkedInsert(db, {
    table: whoopWorkout,
    rows,
    onConflictDoUpdate: {
      target: whoopWorkout.whoopWorkoutId,
      set: {
        userId: sql`excluded.user_id`,
        start: sql`excluded.start`,
        end: sql`excluded.end`,
        timezoneOffset: sql`excluded.timezone_offset`,
        sportName: sql`excluded.sport_name`,
        scoreState: sql`excluded.score_state`,
        score: sql`excluded.score`,
        during: sql`excluded.during`,
        zoneDuration: sql`excluded.zone_duration`,
        updatedAt: sql`excluded.updated_at`,
      },
    },
  });
}

async function syncRecoveries(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  recoveries: WhoopRecovery[],
): Promise<number> {
  const rows = recoveries
    .map((recovery) => {
      const whoopRecoveryId =
        recovery.sleep_id ?? (recovery.cycle_id != null ? String(recovery.cycle_id) : null);
      if (!whoopRecoveryId) return null;

      const recoveryScore = recovery.score?.recovery_score ?? null;
      return {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    })
    .filter((v): v is Exclude<typeof v, null> => v !== null);

  if (rows.length === 0) return 0;

  return chunkedInsert(db, {
    table: whoopRecovery,
    rows,
    onConflictDoUpdate: {
      target: whoopRecovery.whoopRecoveryId,
      set: {
        userId: sql`excluded.user_id`,
        cycleId: sql`excluded.cycle_id`,
        date: sql`excluded.date`,
        recoveryScore: sql`excluded.recovery_score`,
        hrvRmssdMilli: sql`excluded.hrv_rmssd_milli`,
        restingHeartRate: sql`excluded.resting_heart_rate`,
        respiratoryRate: sql`excluded.respiratory_rate`,
        rawData: sql`excluded.raw_data`,
        recoveryScoreTier: sql`excluded.recovery_score_tier`,
        webhookReceivedAt: sql`excluded.webhook_received_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    },
  });
}

async function syncCycles(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  cycles: WhoopCycle[],
): Promise<number> {
  if (cycles.length === 0) return 0;

  const rows = cycles.map((cycle) => {
    const score = cycle.score;
    return {
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
    };
  });

  return chunkedInsert(db, {
    table: whoopCycle,
    rows,
    onConflictDoUpdate: {
      target: whoopCycle.whoopCycleId,
      set: {
        userId: sql`excluded.user_id`,
        start: sql`excluded.start`,
        end: sql`excluded.end`,
        timezoneOffset: sql`excluded.timezone_offset`,
        dayStrain: sql`excluded.day_strain`,
        averageHeartRate: sql`excluded.average_heart_rate`,
        maxHeartRate: sql`excluded.max_heart_rate`,
        kilojoule: sql`excluded.kilojoule`,
        percentRecorded: sql`excluded.percent_recorded`,
        distanceMeter: sql`excluded.distance_meter`,
        altitudeGainMeter: sql`excluded.altitude_gain_meter`,
        altitudeChangeMeter: sql`excluded.altitude_change_meter`,
        rawData: sql`excluded.raw_data`,
        webhookReceivedAt: sql`excluded.webhook_received_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    },
  });
}

async function syncSleepRecords(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  sleepRecords: WhoopSleep[],
): Promise<number> {
  if (sleepRecords.length === 0) return 0;

  const rows = sleepRecords.map((sleep) => {
    const stageSummary = sleep.score?.stage_summary;
    const sleepNeeded = sleep.score?.sleep_needed;
    const totalSleepTimeMilli =
      (stageSummary?.total_light_sleep_time_milli ?? 0) +
      (stageSummary?.total_slow_wave_sleep_time_milli ?? 0) +
      (stageSummary?.total_rem_sleep_time_milli ?? 0);

    return {
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
    };
  });

  return chunkedInsert(db, {
    table: whoopSleep,
    rows,
    onConflictDoUpdate: {
      target: whoopSleep.whoopSleepId,
      set: {
        userId: sql`excluded.user_id`,
        start: sql`excluded.start`,
        end: sql`excluded.end`,
        timezoneOffset: sql`excluded.timezone_offset`,
        sleepPerformancePercentage: sql`excluded.sleep_performance_percentage`,
        totalSleepTimeMilli: sql`excluded.total_sleep_time_milli`,
        sleepEfficiencyPercentage: sql`excluded.sleep_efficiency_percentage`,
        slowWaveSleepTimeMilli: sql`excluded.slow_wave_sleep_time_milli`,
        remSleepTimeMilli: sql`excluded.rem_sleep_time_milli`,
        lightSleepTimeMilli: sql`excluded.light_sleep_time_milli`,
        wakeTimeMilli: sql`excluded.wake_time_milli`,
        disturbanceCount: sql`excluded.disturbance_count`,
        sleepConsistencyPercentage: sql`excluded.sleep_consistency_percentage`,
        sleepNeedBaselineMilli: sql`excluded.sleep_need_baseline_milli`,
        sleepNeedFromSleepDebtMilli: sql`excluded.sleep_need_from_sleep_debt_milli`,
        sleepNeedFromRecentStrainMilli: sql`excluded.sleep_need_from_recent_strain_milli`,
        sleepNeedFromRecentNapMilli: sql`excluded.sleep_need_from_recent_nap_milli`,
        rawData: sql`excluded.raw_data`,
        sleepQualityTier: sql`excluded.sleep_quality_tier`,
        webhookReceivedAt: sql`excluded.webhook_received_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    },
  });
}

async function syncBodyMeasurements(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  measurements: WhoopBodyMeasurement[],
): Promise<number> {
  if (measurements.length === 0) return 0;

  const rows = measurements.map((measurement) => {
    const measurementId =
      measurement.id ??
      measurement.measurement_date ??
      `${measurement.height_meter}:${measurement.weight_kilogram}:${measurement.max_heart_rate ?? 'na'}`;

    return {
      userId,
      whoopMeasurementId: measurementId,
      heightMeter: measurement.height_meter,
      weightKilogram: measurement.weight_kilogram,
      maxHeartRate: measurement.max_heart_rate ?? null,
      measurementDate: measurement.measurement_date ? new Date(measurement.measurement_date) : null,
      rawData: JSON.stringify(measurement),
      webhookReceivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  return chunkedInsert(db, {
    table: whoopBodyMeasurement,
    rows,
    onConflictDoUpdate: {
      target: whoopBodyMeasurement.whoopMeasurementId,
      set: {
        userId: sql`excluded.user_id`,
        heightMeter: sql`excluded.height_meter`,
        weightKilogram: sql`excluded.weight_kilogram`,
        maxHeartRate: sql`excluded.max_heart_rate`,
        measurementDate: sql`excluded.measurement_date`,
        rawData: sql`excluded.raw_data`,
        webhookReceivedAt: sql`excluded.webhook_received_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    },
  });
}

function formatSyncError(error: unknown) {
  if (isWhoopAuthError(error)) {
    return `${error.code}: ${error.message}`;
  }

  if (!(error instanceof Error)) {
    return 'Unknown';
  }

  const cause = error.cause;
  if (cause instanceof Error && cause.message) {
    return `${error.message}: ${cause.message}`;
  }

  if (cause && typeof cause === 'object' && 'message' in cause) {
    return `${error.message}: ${String(cause.message)}`;
  }

  return error.message;
}

export async function syncAllWhoopData(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  options: { isInitialSync?: boolean } = {},
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

  const isInitial = options.isInitialSync ?? false;

  try {
    try {
      const profile = await getWhoopProfileWithToken(db, env, userId);
      result.profile = await upsertWhoopProfile(db, userId, profile);
    } catch (e) {
      result.errors.push(`Profile: ${formatSyncError(e)}`);
    }

    // Determine incremental start dates
    const [latestWorkout, latestRecovery, latestCycle, latestSleep, _latestBodyMeasurement] =
      await Promise.all([
        db
          .select({ maxStart: max(whoopWorkout.start) })
          .from(whoopWorkout)
          .where(eq(whoopWorkout.userId, userId))
          .get(),
        db
          .select({ maxDate: max(whoopRecovery.date) })
          .from(whoopRecovery)
          .where(eq(whoopRecovery.userId, userId))
          .get(),
        db
          .select({ maxStart: max(whoopCycle.start) })
          .from(whoopCycle)
          .where(eq(whoopCycle.userId, userId))
          .get(),
        db
          .select({ maxStart: max(whoopSleep.start) })
          .from(whoopSleep)
          .where(eq(whoopSleep.userId, userId))
          .get(),
        db
          .select({ maxDate: max(whoopBodyMeasurement.measurementDate) })
          .from(whoopBodyMeasurement)
          .where(eq(whoopBodyMeasurement.userId, userId))
          .get(),
      ]);

    const workoutStart = getSyncStartDate(latestWorkout?.maxStart, isInitial);
    const recoveryStart = getSyncStartDate(latestRecovery?.maxDate, isInitial);
    const cycleStart = getSyncStartDate(latestCycle?.maxStart, isInitial);
    const sleepStart = getSyncStartDate(latestSleep?.maxStart, isInitial);

    // Fetch all data categories in parallel with independent error handling
    let workouts: WhoopWorkout[] = [];
    let recoveries: WhoopRecovery[] = [];
    let cycles: WhoopCycle[] = [];
    let sleepRecords: WhoopSleep[] = [];
    let measurements: WhoopBodyMeasurement[] = [];

    await Promise.all([
      (async () => {
        try {
          workouts = await fetchWorkoutsWithToken(db, env, userId, workoutStart);
        } catch (e) {
          result.errors.push(`Workouts: ${formatSyncError(e)}`);
        }
      })(),
      (async () => {
        try {
          recoveries = await fetchRecoveriesWithToken(db, env, userId, recoveryStart);
        } catch (e) {
          result.errors.push(`Recovery: ${formatSyncError(e)}`);
        }
      })(),
      (async () => {
        try {
          cycles = await fetchCyclesWithToken(db, env, userId, cycleStart);
        } catch (e) {
          const msg = formatSyncError(e);
          if (e && typeof e === 'object' && 'status' in e && e.status === 403) {
            // no-op
          } else {
            result.errors.push(`Cycles: ${msg}`);
          }
        }
      })(),
      (async () => {
        try {
          sleepRecords = await fetchSleepWithToken(db, env, userId, sleepStart);
        } catch (e) {
          result.errors.push(`Sleep: ${formatSyncError(e)}`);
        }
      })(),
      (async () => {
        try {
          measurements = await fetchBodyMeasurementsWithToken(db, env, userId);
        } catch (e) {
          result.errors.push(`Body Measurements: ${formatSyncError(e)}`);
        }
      })(),
    ]);

    // Batch insert each category
    try {
      result.workouts = await syncWorkouts(db, userId, workouts);
    } catch (e) {
      result.errors.push(`Workouts insert: ${formatSyncError(e)}`);
    }

    try {
      result.recovery = await syncRecoveries(db, userId, recoveries);
    } catch (e) {
      result.errors.push(`Recovery insert: ${formatSyncError(e)}`);
    }

    try {
      result.cycles = await syncCycles(db, userId, cycles);
    } catch (e) {
      result.errors.push(`Cycles insert: ${formatSyncError(e)}`);
    }

    try {
      result.sleep = await syncSleepRecords(db, userId, sleepRecords);
    } catch (e) {
      result.errors.push(`Sleep insert: ${formatSyncError(e)}`);
    }

    try {
      result.bodyMeasurements = await syncBodyMeasurements(db, userId, measurements);
    } catch (e) {
      result.errors.push(`Body Measurements insert: ${formatSyncError(e)}`);
    }
  } catch (e) {
    result.errors.push(`Sync error: ${formatSyncError(e)}`);
  }

  return result;
}
