import type { WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { withValidToken } from './token-manager';
import * as rawApi from './api';

export function getWhoopProfile(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
): Promise<rawApi.WhoopProfile> {
  return withValidToken(db, env, userId, 'Profile', (token) => rawApi.getWhoopProfile(token));
}

export function fetchWorkoutById(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  workoutId: string,
): Promise<rawApi.WhoopWorkout> {
  return withValidToken(db, env, userId, 'Workout', (token) =>
    rawApi.fetchWorkoutById(token, workoutId),
  );
}

export function fetchSleepById(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  sleepId: string,
): Promise<rawApi.WhoopSleep> {
  return withValidToken(db, env, userId, 'Sleep', (token) => rawApi.fetchSleepById(token, sleepId));
}

export function fetchRecoveryByCycleId(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  cycleId: number,
): Promise<rawApi.WhoopRecovery> {
  return withValidToken(db, env, userId, 'Recovery', (token) =>
    rawApi.fetchRecoveryByCycleId(token, cycleId),
  );
}

export function fetchWorkouts(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  start?: Date,
): Promise<rawApi.WhoopWorkout[]> {
  return withValidToken(db, env, userId, 'Workouts', (token) => rawApi.fetchWorkouts(token, start));
}

export function fetchRecoveries(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  start?: Date,
): Promise<rawApi.WhoopRecovery[]> {
  return withValidToken(db, env, userId, 'Recovery', (token) =>
    rawApi.fetchRecoveries(token, start),
  );
}

export function fetchCycles(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  start?: Date,
): Promise<rawApi.WhoopCycle[]> {
  return withValidToken(db, env, userId, 'Cycles', (token) => rawApi.fetchCycles(token, start));
}

export function fetchSleep(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  start?: Date,
): Promise<rawApi.WhoopSleep[]> {
  return withValidToken(db, env, userId, 'Sleep', (token) => rawApi.fetchSleep(token, start));
}

export function fetchBodyMeasurements(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
): Promise<rawApi.WhoopBodyMeasurement[]> {
  return withValidToken(db, env, userId, 'Body Measurements', (token) =>
    rawApi.fetchBodyMeasurements(token),
  );
}
