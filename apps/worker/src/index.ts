/* oxlint-disable no-unused-vars */
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import {
  createAuth,
  isDevAuthEnabled,
  resolveBaseURL,
  resolveWorkerEnv,
  type WorkerEnv,
} from './auth';
import { createDb, getAuth, populateAuthContext, createHandler } from './api/auth';
import {
  requireOwnedNutritionEntry,
  requireOwnedProgramCycle,
  requireOwnedProgramCycleWorkout,
  requireOwnedTemplate,
  requireOwnedWorkout,
  requireOwnedWorkoutExercise,
  requireOwnedWorkoutSet,
} from './api/guards';
import { eq, and, or, gt, like, desc, sql, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import {
  exerciseLibrary,
  chunkedQuery,
  chunkedQueryMany,
  chunkedInsert,
  batchParallel,
  isValidTimeZone,
  formatLocalDate,
  whoopRecovery,
  whoopSleep,
  whoopCycle,
  whoopWorkout,
} from '@strength/db';
import {
  createProgramCycle,
  getOrCreateExerciseForUser,
  getProgramCycleWithWorkouts,
  getProgramCycleById,
  softDeleteProgramCycle,
} from '@strength/db';
import { getProgram, generateWorkoutSchedule } from './programs';
import { buildWhoopAuthorizationUrl, exchangeCodeForTokens, WHOOP_API_BASE } from './whoop/auth';
import { storeWhoopTokens, revokeWhoopIntegration } from './whoop/token-rotation';
import { getWhoopProfile } from './whoop/api';
import { syncAllWhoopData, upsertWhoopProfile } from './whoop/sync';
import { isWhoopAuthError, toWhoopAuthErrorResponse } from './whoop/errors';
import { getValidWhoopToken } from './whoop/token-manager';
import {
  handleWebhookEvent,
  normalizeWhoopWebhookPayload,
  verifyWebhookSignature,
} from './whoop/webhook';
import {
  isWhoopConnected,
  whoopIntegrationExists,
  getWhoopUserId,
  getWhoopProfileByUserId,
} from './whoop/user';
import {
  getStoredUserTimezone,
  getUtcRangeForLocalDate,
  resolveUserTimezone,
} from './lib/timezone';

type Variables = {
  user: ReturnType<typeof createAuth>['$Infer']['Session']['user'] | null;
  session: ReturnType<typeof createAuth>['$Infer']['Session']['session'] | null;
};

const app = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

function getAllowedOrigins(env: WorkerEnv): string[] {
  const appScheme = env.APP_SCHEME ?? 'strength';
  const origins: string[] = [`${appScheme}://`, 'exp://'];
  const baseURL = env.WORKER_BASE_URL;
  if (baseURL) {
    try {
      origins.push(new URL(baseURL).origin);
    } catch {}
  }
  return origins;
}

function isAllowedDevOrigin(origin: string, allowedOrigins: string[]) {
  if (!origin) {
    console.log('[CORS] No origin provided, allowing');
    return true;
  }
  const allowed =
    allowedOrigins.some((o) => origin.startsWith(o)) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^http:\/\/(?:10|192\.168|172\.(?:1[6-9]|2\d|3[0-1]))(?:\.\d{1,3}){2}(?::\d+)?$/i.test(origin);
  console.log('[CORS] Origin check:', { origin: origin?.slice(0, 50), allowed });
  return allowed;
}

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      if (!origin) return '*';
      const allowedOrigins = getAllowedOrigins(c.env as WorkerEnv);
      if (isAllowedDevOrigin(origin, allowedOrigins)) return origin;
      return '*';
    },
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Set-Cookie'],
    credentials: true,
  }),
);

app.options('/api/*', async (c) => {
  return c.text('', 200);
});

app.use('*', async (c, next) => {
  await populateAuthContext(c);
  await next();
});

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    authEnabled: true,
  });
});

app.get('/api/debug/auth-check', async (c) => {
  const db = createDb(c.env);
  const users = await db.select().from(schema.user).all();
  const sessions = await db.select().from(schema.session).all();
  console.log(
    '[DEBUG] Users in DB:',
    users.length,
    users.map((u) => ({ id: u.id, email: u.email })),
  );
  console.log(
    '[DEBUG] Sessions in DB:',
    sessions.length,
    sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      expiresAt: new Date(s.expiresAt).toISOString(),
    })),
  );
  return c.json({
    userCount: users.length,
    sessionCount: sessions.length,
    users: users.map((u) => ({ id: u.id, email: u.email, name: u.name })),
    sessions: sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      expiresAt: new Date(s.expiresAt).toISOString(),
    })),
  });
});

app.get(
  '/api/me',
  createHandler(async (c, { userId, db }) => {
    const user = c.get('user');
    const session = c.get('session');
    return c.json({ user, session });
  }),
);

app.get(
  '/api/profile/preferences',
  createHandler(async (c, { userId, db }) => {
    try {
      let prefs = await db
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .get();

      if (!prefs) {
        const now = new Date();
        const result = await db
          .insert(schema.userPreferences)
          .values({
            userId,
            weightUnit: 'kg',
            timezone: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        prefs = result;
      }

      return c.json({
        weightUnit: prefs.weightUnit ?? 'kg',
        timezone: prefs.timezone ?? null,
        weightPromptedAt: prefs.weightPromptedAt ?? null,
      });
    } catch (e) {
      console.log('DEBUG getPreferences error:', e);
      return c.json({ message: 'Failed to fetch preferences' }, 500);
    }
  }),
);

app.put(
  '/api/profile/preferences',
  createHandler(async (c, { userId, db }) => {
    try {
      let body: Record<string, unknown> = {};
      try {
        const rawBody = await c.req.text();
        console.log('[PREF DEBUG] raw body:', rawBody, 'length:', rawBody.length);
        if (rawBody.trim()) {
          body = JSON.parse(rawBody) as Record<string, unknown>;
        }
      } catch (parseErr) {
        console.log('[PREF DEBUG] JSON parse error:', parseErr);
      }

      console.log('[PREF DEBUG] parsed body:', body);
      const weightUnit = typeof body.weightUnit === 'string' ? body.weightUnit : undefined;
      const timezone =
        body.timezone === null
          ? null
          : typeof body.timezone === 'string'
            ? body.timezone
            : undefined;
      const weightPromptedAt =
        body.weightPromptedAt === null
          ? null
          : typeof body.weightPromptedAt === 'string'
            ? body.weightPromptedAt
            : undefined;

      if (weightUnit !== undefined && !['kg', 'lbs'].includes(weightUnit)) {
        return c.json({ message: 'Invalid weight unit' }, 400);
      }

      if (timezone !== undefined && timezone !== null && !isValidTimeZone(timezone)) {
        return c.json({ message: 'Invalid timezone' }, 400);
      }

      console.log('[PREF DEBUG] extracted fields:', { weightUnit, timezone, weightPromptedAt });

      const existing = await db
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .get();

      const nextWeightUnit = weightUnit ?? existing?.weightUnit ?? 'kg';
      const nextTimezone = timezone === undefined ? (existing?.timezone ?? null) : timezone;
      const nextWeightPromptedAt =
        weightPromptedAt === undefined
          ? (existing?.weightPromptedAt ?? null)
          : weightPromptedAt
            ? new Date(weightPromptedAt)
            : null;

      let result;
      if (existing) {
        result = await db
          .update(schema.userPreferences)
          .set({
            weightUnit: nextWeightUnit,
            timezone: nextTimezone,
            weightPromptedAt: nextWeightPromptedAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.userPreferences.userId, userId))
          .returning()
          .get();
      } else {
        const now = new Date();
        result = await db
          .insert(schema.userPreferences)
          .values({
            userId,
            weightUnit: nextWeightUnit,
            timezone: nextTimezone,
            weightPromptedAt: nextWeightPromptedAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
      }

      return c.json({
        weightUnit: result.weightUnit ?? 'kg',
        timezone: result.timezone ?? null,
        weightPromptedAt: result.weightPromptedAt ?? null,
      });
    } catch (e) {
      console.log('DEBUG updatePreferences error:', e);
      return c.json({ message: 'Failed to update preferences' }, 500);
    }
  }),
);

app.on(['GET', 'POST'], '/api/auth/*', async (c, next) => {
  if (c.req.path === '/api/auth/whoop/callback') {
    await next();
    return;
  }

  const auth = getAuth(c);
  const response = await auth.handler(c.req.raw);

  return response;
});

function getDb(c: any) {
  return createDb(c.env);
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (_e) {
    return null;
  }

  return null;
}

function getObject(
  source: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNumber(source: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = source?.[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getTimestamp(
  source: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = source?.[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function withWhoopFallbacks<T extends Record<string, unknown>, U extends Record<string, unknown>>(
  row: T,
  patch: U,
): T & U {
  return { ...row, ...patch };
}

async function getLastCompletedExerciseSnapshot(db: any, userId: string, exerciseId: string) {
  let resolvedExerciseId: string | null = null;

  const directExercise = await db
    .select({ id: schema.exercises.id, libraryId: schema.exercises.libraryId })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.userId, userId)))
    .get();

  if (directExercise) {
    resolvedExerciseId = directExercise.id;
  } else {
    const byLibraryId = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(and(eq(schema.exercises.libraryId, exerciseId), eq(schema.exercises.userId, userId)))
      .get();

    if (byLibraryId) {
      resolvedExerciseId = byLibraryId.id;
    }
  }

  if (!resolvedExerciseId) {
    return null;
  }

  const recentWorkoutExercise = await db
    .select({
      workoutExerciseId: schema.workoutExercises.id,
      workoutCompletedAt: schema.workouts.completedAt,
    })
    .from(schema.workoutExercises)
    .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .where(
      and(
        eq(schema.workoutExercises.exerciseId, resolvedExerciseId),
        eq(schema.workouts.userId, userId),
        sql`${schema.workouts.completedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.workouts.completedAt))
    .limit(1)
    .get();

  if (!recentWorkoutExercise) {
    return null;
  }

  const allSets = await db
    .select({
      weight: schema.workoutSets.weight,
      reps: schema.workoutSets.reps,
      rpe: schema.workoutSets.rpe,
      setNumber: schema.workoutSets.setNumber,
    })
    .from(schema.workoutSets)
    .where(eq(schema.workoutSets.workoutExerciseId, recentWorkoutExercise.workoutExerciseId))
    .orderBy(schema.workoutSets.setNumber)
    .all();

  return {
    exerciseId: resolvedExerciseId,
    workoutDate: recentWorkoutExercise.workoutCompletedAt
      ? new Date(recentWorkoutExercise.workoutCompletedAt).toISOString().split('T')[0]
      : null,
    sets: allSets.map(
      (s: {
        weight: number | null;
        reps: number | null;
        rpe: number | null;
        setNumber: number | null;
      }) => ({
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        setNumber: s.setNumber,
      }),
    ),
  };
}

function normalizeProgramSetCount(value: unknown, fallback = 1) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return fallback;
}

function normalizeProgramReps(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

type SerializedProgramTargetLift = {
  name?: unknown;
  lift?: unknown;
  accessoryId?: unknown;
  targetWeight?: unknown;
  addedWeight?: unknown;
  sets?: unknown;
  reps?: unknown;
  isAccessory?: unknown;
  isRequired?: unknown;
  isAmrap?: unknown;
  libraryId?: unknown;
  exerciseId?: unknown;
};

type NormalizedProgramTargetLift = {
  name: string;
  lift?: string;
  accessoryId?: string;
  targetWeight: number | null;
  addedWeight: number;
  sets: number;
  reps: number | string | null;
  isAccessory: boolean;
  isRequired: boolean;
  isAmrap: boolean;
  libraryId?: string;
  exerciseId?: string;
};

function isProgramAmrap(targetLift: { name?: unknown; reps?: unknown; isAmrap?: unknown }) {
  if (targetLift.isAmrap === true) {
    return true;
  }

  if (typeof targetLift.reps === 'string' && targetLift.reps.trim().toUpperCase() === 'AMRAP') {
    return true;
  }

  return typeof targetLift.name === 'string' && /\d+\+$/.test(targetLift.name.trim());
}

function normalizeProgramTargetLift(
  targetLift: SerializedProgramTargetLift,
  defaults?: { isAccessory?: boolean; isRequired?: boolean },
): NormalizedProgramTargetLift | null {
  if (typeof targetLift.name !== 'string' || targetLift.name.trim().length === 0) {
    return null;
  }

  const isAccessory =
    typeof targetLift.isAccessory === 'boolean'
      ? targetLift.isAccessory
      : (defaults?.isAccessory ?? false);
  const isRequired =
    typeof targetLift.isRequired === 'boolean'
      ? targetLift.isRequired
      : (defaults?.isRequired ?? true);
  const isAmrap = isProgramAmrap(targetLift);

  return {
    name: targetLift.name,
    lift: typeof targetLift.lift === 'string' ? targetLift.lift : undefined,
    accessoryId: typeof targetLift.accessoryId === 'string' ? targetLift.accessoryId : undefined,
    targetWeight:
      typeof targetLift.targetWeight === 'number' && Number.isFinite(targetLift.targetWeight)
        ? targetLift.targetWeight
        : null,
    addedWeight:
      typeof targetLift.addedWeight === 'number' && Number.isFinite(targetLift.addedWeight)
        ? targetLift.addedWeight
        : 0,
    sets: normalizeProgramSetCount(targetLift.sets, 1),
    reps:
      typeof targetLift.reps === 'number' || typeof targetLift.reps === 'string'
        ? targetLift.reps
        : null,
    isAccessory,
    isRequired,
    isAmrap,
    libraryId: typeof targetLift.libraryId === 'string' ? targetLift.libraryId : undefined,
    exerciseId: typeof targetLift.exerciseId === 'string' ? targetLift.exerciseId : undefined,
  };
}

function parseProgramTargetLifts(targetLifts: string | null | undefined) {
  if (!targetLifts) {
    return {
      exercises: [] as NormalizedProgramTargetLift[],
      accessories: [] as NormalizedProgramTargetLift[],
      all: [] as NormalizedProgramTargetLift[],
    };
  }

  try {
    const parsed = JSON.parse(targetLifts);
    const exercises: NormalizedProgramTargetLift[] = [];
    const accessories: NormalizedProgramTargetLift[] = [];

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const normalized = normalizeProgramTargetLift(item ?? {});
        if (!normalized) {
          continue;
        }

        if (normalized.isAccessory) {
          accessories.push(normalized);
        } else {
          exercises.push(normalized);
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      const record = parsed as {
        exercises?: SerializedProgramTargetLift[];
        accessories?: SerializedProgramTargetLift[];
      };

      for (const item of record.exercises ?? []) {
        const normalized = normalizeProgramTargetLift(item ?? {}, { isAccessory: false });
        if (normalized) {
          exercises.push(normalized);
        }
      }

      for (const item of record.accessories ?? []) {
        const normalized = normalizeProgramTargetLift(item ?? {}, {
          isAccessory: true,
          isRequired: false,
        });
        if (normalized) {
          accessories.push(normalized);
        }
      }
    }

    return {
      exercises,
      accessories,
      all: [...exercises, ...accessories],
    };
  } catch {
    return {
      exercises: [] as NormalizedProgramTargetLift[],
      accessories: [] as NormalizedProgramTargetLift[],
      all: [] as NormalizedProgramTargetLift[],
    };
  }
}

function getCurrentCycleWorkout(
  cycle: { currentWeek: number; currentSession: number },
  workouts: Array<{
    id: string;
    weekNumber: number;
    sessionNumber: number;
    isComplete?: boolean;
    targetLifts?: string | null;
    sessionName?: string;
    scheduledAt?: number | null;
    workoutId?: string | null;
  }>,
) {
  return (
    workouts.find(
      (workout) =>
        workout.weekNumber === cycle.currentWeek && workout.sessionNumber === cycle.currentSession,
    ) ??
    workouts.find((workout) => !workout.isComplete) ??
    null
  );
}

async function getLatestOneRMsForUser(db: any, userId: string) {
  const latestOneRMWorkout = await db
    .select({
      squat1rm: schema.workouts.squat1rm,
      bench1rm: schema.workouts.bench1rm,
      deadlift1rm: schema.workouts.deadlift1rm,
      ohp1rm: schema.workouts.ohp1rm,
      completedAt: schema.workouts.completedAt,
    })
    .from(schema.workouts)
    .where(
      and(
        eq(schema.workouts.userId, userId),
        eq(schema.workouts.name, '1RM Test'),
        sql`${schema.workouts.completedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.workouts.completedAt))
    .limit(1)
    .get();

  if (
    latestOneRMWorkout &&
    (latestOneRMWorkout.squat1rm ||
      latestOneRMWorkout.bench1rm ||
      latestOneRMWorkout.deadlift1rm ||
      latestOneRMWorkout.ohp1rm)
  ) {
    return latestOneRMWorkout;
  }

  const latestCycle = await db
    .select({
      squat1rm: schema.userProgramCycles.squat1rm,
      bench1rm: schema.userProgramCycles.bench1rm,
      deadlift1rm: schema.userProgramCycles.deadlift1rm,
      ohp1rm: schema.userProgramCycles.ohp1rm,
      completedAt: schema.userProgramCycles.startedAt,
    })
    .from(schema.userProgramCycles)
    .where(eq(schema.userProgramCycles.userId, userId))
    .orderBy(desc(schema.userProgramCycles.startedAt))
    .limit(1)
    .get();

  return latestCycle ?? null;
}

async function getLatestOneRMTestWorkoutForCycle(db: any, userId: string, cycleId: string) {
  return db
    .select()
    .from(schema.workouts)
    .where(
      and(
        eq(schema.workouts.userId, userId),
        eq(schema.workouts.programCycleId, cycleId),
        eq(schema.workouts.name, '1RM Test'),
        eq(schema.workouts.isDeleted, false),
      ),
    )
    .orderBy(desc(schema.workouts.completedAt), desc(schema.workouts.createdAt))
    .limit(1)
    .get();
}

async function createOneRMTestWorkout(db: any, userId: string, cycleId: string) {
  const cycle = await getProgramCycleById(db, cycleId, userId);
  if (!cycle) {
    return null;
  }

  const existingWorkout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
  if (existingWorkout && !existingWorkout.completedAt) {
    return existingWorkout;
  }

  const now = new Date();

  const workout = await db
    .insert(schema.workouts)
    .values({
      userId,
      programCycleId: cycleId,
      name: '1RM Test',
      notes: null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      startingSquat1rm: cycle.startingSquat1rm ?? cycle.squat1rm,
      startingBench1rm: cycle.startingBench1rm ?? cycle.bench1rm,
      startingDeadlift1rm: cycle.startingDeadlift1rm ?? cycle.deadlift1rm,
      startingOhp1rm: cycle.startingOhp1rm ?? cycle.ohp1rm,
    })
    .returning()
    .get();

  const mainLifts = [
    { name: 'Squat', lift: 'squat' as const },
    { name: 'Bench Press', lift: 'bench' as const },
    { name: 'Deadlift', lift: 'deadlift' as const },
    { name: 'Overhead Press', lift: 'ohp' as const },
  ];

  for (let i = 0; i < mainLifts.length; i++) {
    const lift = mainLifts[i];
    const exerciseId = await getOrCreateExerciseForUser(db, userId, lift.name, lift.lift);
    const workoutExercise = await db
      .insert(schema.workoutExercises)
      .values({
        workoutId: workout.id,
        exerciseId,
        orderIndex: i,
        isAmrap: false,
        updatedAt: now,
      })
      .returning()
      .get();

    await db
      .insert(schema.workoutSets)
      .values({
        workoutExerciseId: workoutExercise.id,
        setNumber: 1,
        weight: 0,
        reps: 1,
        rpe: null,
        isComplete: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return workout;
}

async function updateProgramCycleOneRMs(
  db: any,
  userId: string,
  cycleId: string,
  data: { squat1rm?: number; bench1rm?: number; deadlift1rm?: number; ohp1rm?: number },
) {
  const existingCycle = await getProgramCycleById(db, cycleId, userId);
  if (!existingCycle) {
    return null;
  }

  return db
    .update(schema.userProgramCycles)
    .set({
      ...data,
      startingSquat1rm: existingCycle.startingSquat1rm ?? existingCycle.squat1rm,
      startingBench1rm: existingCycle.startingBench1rm ?? existingCycle.bench1rm,
      startingDeadlift1rm: existingCycle.startingDeadlift1rm ?? existingCycle.deadlift1rm,
      startingOhp1rm: existingCycle.startingOhp1rm ?? existingCycle.ohp1rm,
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.userProgramCycles.id, cycleId), eq(schema.userProgramCycles.userId, userId)),
    )
    .returning()
    .get();
}

async function createWorkoutFromProgramCycleWorkout(
  db: any,
  userId: string,
  cycleId: string,
  cycleWorkout: any,
) {
  const now = new Date();
  let createdWorkoutId: string | null = null;
  const workout = await db
    .insert(schema.workouts)
    .values({
      userId,
      programCycleId: cycleId,
      name: cycleWorkout.sessionName,
      notes: null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  createdWorkoutId = workout.id;

  try {
    const targetLifts = parseProgramTargetLifts(cycleWorkout.targetLifts);
    if (targetLifts.all.length === 0) {
      throw new Error(`Program cycle workout ${cycleWorkout.id} has no target lifts`);
    }

    const exerciseIdList: {
      workoutExerciseId: string;
      exerciseId: string;
      orderIndex: number;
      isAmrap: boolean;
      targetLift: any;
    }[] = [];
    for (let i = 0; i < targetLifts.all.length; i++) {
      const targetLift = targetLifts.all[i];
      const isAmrap = targetLift.isAmrap;
      let exerciseId: string;
      if (targetLift.exerciseId) {
        exerciseId = targetLift.exerciseId;
      } else {
        exerciseId = await getOrCreateExerciseForUser(
          db,
          userId,
          targetLift.name,
          targetLift.lift as 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row' | undefined,
          targetLift.libraryId,
        );
      }
      exerciseIdList.push({
        workoutExerciseId: schema.generateId(),
        exerciseId,
        orderIndex: i,
        isAmrap,
        targetLift,
      });
    }

    const workoutExerciseRows = exerciseIdList.map(
      ({ workoutExerciseId, exerciseId, orderIndex, isAmrap }) => ({
        id: workoutExerciseId,
        workoutId: workout.id,
        exerciseId,
        orderIndex,
        isAmrap,
        updatedAt: now,
      }),
    );

    await chunkedInsert(db, { table: schema.workoutExercises, rows: workoutExerciseRows });
    const allSetRows: (typeof schema.workoutSets.$inferInsert)[] = [];

    for (const { workoutExerciseId, isAmrap, targetLift } of exerciseIdList) {
      const fallbackSetCount = normalizeProgramSetCount(targetLift.sets, 1);
      const fallbackWeight =
        typeof targetLift.targetWeight === 'number' && Number.isFinite(targetLift.targetWeight)
          ? targetLift.targetWeight
          : null;
      const fallbackReps = isAmrap ? null : normalizeProgramReps(targetLift.reps);

      const setRows = Array.from({ length: fallbackSetCount }, (_, index) => ({
        workoutExerciseId,
        setNumber: index + 1,
        weight: fallbackWeight,
        reps: fallbackReps,
        rpe: null,
        isComplete: false,
        createdAt: now,
        updatedAt: now,
      }));
      allSetRows.push(...setRows);
    }

    if (allSetRows.length > 0) {
      await chunkedInsert(db, { table: schema.workoutSets, rows: allSetRows });
    }

    await db
      .update(schema.programCycleWorkouts)
      .set({
        workoutId: workout.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.programCycleWorkouts.id, cycleWorkout.id),
          eq(schema.programCycleWorkouts.cycleId, cycleId),
        ),
      )
      .run();

    return workout;
  } catch (e) {
    if (createdWorkoutId) {
      await db
        .delete(schema.workouts)
        .where(and(eq(schema.workouts.id, createdWorkoutId), eq(schema.workouts.userId, userId)))
        .run()
        .catch((cleanupError: unknown) => {
          console.error('Failed to clean up partial program workout:', cleanupError);
        });
    }

    throw e;
  }
}

async function advanceProgramCycleForWorkout(db: any, userId: string, workoutId: string) {
  const linkedCycleWorkout = await db
    .select({
      id: schema.programCycleWorkouts.id,
      cycleId: schema.programCycleWorkouts.cycleId,
      weekNumber: schema.programCycleWorkouts.weekNumber,
      sessionNumber: schema.programCycleWorkouts.sessionNumber,
      isComplete: schema.programCycleWorkouts.isComplete,
      currentWeek: schema.userProgramCycles.currentWeek,
      currentSession: schema.userProgramCycles.currentSession,
      totalSessionsCompleted: schema.userProgramCycles.totalSessionsCompleted,
      totalSessionsPlanned: schema.userProgramCycles.totalSessionsPlanned,
    })
    .from(schema.programCycleWorkouts)
    .innerJoin(
      schema.userProgramCycles,
      eq(schema.programCycleWorkouts.cycleId, schema.userProgramCycles.id),
    )
    .where(
      and(
        eq(schema.programCycleWorkouts.workoutId, workoutId),
        eq(schema.userProgramCycles.userId, userId),
      ),
    )
    .get();

  if (!linkedCycleWorkout || linkedCycleWorkout.isComplete) {
    return;
  }

  const nextCycleWorkout = await db
    .select({
      id: schema.programCycleWorkouts.id,
      weekNumber: schema.programCycleWorkouts.weekNumber,
      sessionNumber: schema.programCycleWorkouts.sessionNumber,
    })
    .from(schema.programCycleWorkouts)
    .where(
      and(
        eq(schema.programCycleWorkouts.cycleId, linkedCycleWorkout.cycleId),
        or(
          and(gt(schema.programCycleWorkouts.weekNumber, linkedCycleWorkout.weekNumber)),
          and(
            eq(schema.programCycleWorkouts.weekNumber, linkedCycleWorkout.weekNumber),
            gt(schema.programCycleWorkouts.sessionNumber, linkedCycleWorkout.sessionNumber),
          ),
        ),
        eq(schema.programCycleWorkouts.isComplete, false),
      ),
    )
    .orderBy(schema.programCycleWorkouts.weekNumber, schema.programCycleWorkouts.sessionNumber)
    .limit(1)
    .get();

  const now = new Date();

  await db
    .update(schema.programCycleWorkouts)
    .set({
      isComplete: true,
      updatedAt: now,
    })
    .where(eq(schema.programCycleWorkouts.id, linkedCycleWorkout.id))
    .run();

  const cycleUpdate: Record<string, unknown> = {
    totalSessionsCompleted: linkedCycleWorkout.totalSessionsCompleted + 1,
    updatedAt: now,
  };

  if (nextCycleWorkout) {
    cycleUpdate.currentWeek = nextCycleWorkout.weekNumber;
    cycleUpdate.currentSession = nextCycleWorkout.sessionNumber;
  } else {
    cycleUpdate.status = 'completed';
    cycleUpdate.isComplete = true;
    cycleUpdate.completedAt = now;
  }

  await db
    .update(schema.userProgramCycles)
    .set(cycleUpdate)
    .where(
      and(
        eq(schema.userProgramCycles.id, linkedCycleWorkout.cycleId),
        eq(schema.userProgramCycles.userId, userId),
      ),
    )
    .run();
}

async function resolveToUserExerciseId(
  db: any,
  userId: string,
  exerciseId: string,
): Promise<string> {
  const existingExercise = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.userId, userId)))
    .get();

  if (existingExercise) {
    return existingExercise.id;
  }

  const existingLibraryExercise = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.userId, userId), eq(schema.exercises.libraryId, exerciseId)))
    .get();

  if (existingLibraryExercise) {
    return existingLibraryExercise.id;
  }

  const libraryExercise = exerciseLibrary.find((e) => e.id === exerciseId);

  if (libraryExercise) {
    const now = new Date();
    const created = await db
      .insert(schema.exercises)
      .values({
        userId,
        name: libraryExercise.name,
        muscleGroup: libraryExercise.muscleGroup,
        description: libraryExercise.description,
        libraryId: libraryExercise.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.exercises.id })
      .get();
    return created.id;
  }

  return exerciseId;
}

async function findExistingUserExerciseByName(db: any, userId: string, name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (!normalizedName) {
    return null;
  }

  return db
    .select()
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.userId, userId),
        eq(schema.exercises.isDeleted, false),
        sql`lower(${schema.exercises.name}) = ${normalizedName}`,
      ),
    )
    .get();
}

app.get(
  '/api/exercises',
  createHandler(async (c, { userId, db }) => {
    const search = c.req.query('search');
    try {
      const conditions = [
        eq(schema.exercises.userId, userId),
        eq(schema.exercises.isDeleted, false),
      ];
      if (search) {
        conditions.push(like(schema.exercises.name, `%${search}%`));
      }
      const results = await db
        .select({
          id: schema.exercises.id,
          name: schema.exercises.name,
          muscleGroup: schema.exercises.muscleGroup,
          description: schema.exercises.description,
          libraryId: schema.exercises.libraryId,
          createdAt: schema.exercises.createdAt,
          updatedAt: schema.exercises.updatedAt,
        })
        .from(schema.exercises)
        .where(and(...conditions))
        .orderBy(desc(schema.exercises.createdAt))
        .all();
      return c.json(results);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch exercises' }, 500);
    }
  }),
);

app.post(
  '/api/exercises',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { name, muscleGroup, description, libraryId } = body;
      const trimmedName = typeof name === 'string' ? name.trim() : '';

      if (!trimmedName) {
        return c.json({ message: 'Name is required' }, 400);
      }

      if (libraryId) {
        const resolvedExerciseId = await resolveToUserExerciseId(db, userId, libraryId);
        const existingLibraryExercise = await db
          .select()
          .from(schema.exercises)
          .where(
            and(
              eq(schema.exercises.id, resolvedExerciseId),
              eq(schema.exercises.userId, userId),
              eq(schema.exercises.isDeleted, false),
            ),
          )
          .get();

        if (!existingLibraryExercise) {
          return c.json({ message: 'Exercise not found' }, 404);
        }

        const existingByName = await findExistingUserExerciseByName(
          db,
          userId,
          existingLibraryExercise.name,
        );
        if (existingByName && existingByName.id !== existingLibraryExercise.id) {
          return c.json(existingByName, 200);
        }

        return c.json(existingLibraryExercise, 201);
      }

      const existingExercise = await findExistingUserExerciseByName(db, userId, trimmedName);

      if (existingExercise) {
        return c.json(existingExercise, 200);
      }

      const now = new Date();
      const result = await db
        .insert(schema.exercises)
        .values({
          userId,
          name: trimmedName,
          muscleGroup: muscleGroup || null,
          description: description || null,
          libraryId: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return c.json(result, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to create exercise' }, 500);
    }
  }),
);

app.get(
  '/api/exercises/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const result = await db
        .select()
        .from(schema.exercises)
        .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
        .get();
      if (!result) {
        return c.json({ message: 'Exercise not found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch exercise' }, 500);
    }
  }),
);

app.put(
  '/api/exercises/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const body = await c.req.json();
      const result = await db
        .update(schema.exercises)
        .set({
          ...body,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
        .returning()
        .get();
      if (!result) {
        return c.json({ message: 'Exercise not found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to update exercise' }, 500);
    }
  }),
);

app.delete(
  '/api/exercises/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const result = await db
        .update(schema.exercises)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
        .run();
      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to delete exercise' }, 500);
    }
  }),
);

app.get(
  '/api/templates',
  createHandler(async (c, { userId, db }) => {
    try {
      const results = await db
        .select({
          id: schema.templates.id,
          name: schema.templates.name,
          description: schema.templates.description,
          notes: schema.templates.notes,
          createdAt: schema.templates.createdAt,
          updatedAt: schema.templates.updatedAt,
        })
        .from(schema.templates)
        .where(and(eq(schema.templates.userId, userId), eq(schema.templates.isDeleted, false)))
        .orderBy(desc(schema.templates.createdAt))
        .all();

      if (results.length === 0) {
        return c.json([]);
      }

      const templateIds = results.map((template) => template.id);
      const templateExercises = await chunkedQueryMany(db, {
        ids: templateIds,
        builder: (chunk) =>
          db
            .select({
              templateId: schema.templateExercises.templateId,
              id: schema.templateExercises.id,
              exerciseId: schema.templateExercises.exerciseId,
              name: schema.exercises.name,
              muscleGroup: schema.exercises.muscleGroup,
              sets: schema.templateExercises.sets,
              reps: schema.templateExercises.reps,
              targetWeight: schema.templateExercises.targetWeight,
              isAmrap: schema.templateExercises.isAmrap,
              isAccessory: schema.templateExercises.isAccessory,
              isRequired: schema.templateExercises.isRequired,
              orderIndex: schema.templateExercises.orderIndex,
            })
            .from(schema.templateExercises)
            .innerJoin(
              schema.exercises,
              eq(schema.templateExercises.exerciseId, schema.exercises.id),
            )
            .where(inArray(schema.templateExercises.templateId, chunk))
            .orderBy(schema.templateExercises.orderIndex)
            .all(),
      });

      const exercisesByTemplate = new Map<string, Array<(typeof templateExercises)[number]>>();
      for (const exercise of templateExercises) {
        const currentExercises = exercisesByTemplate.get(exercise.templateId) ?? [];
        currentExercises.push(exercise);
        exercisesByTemplate.set(exercise.templateId, currentExercises);
      }

      return c.json(
        results.map((template) => ({
          ...template,
          exercises: (exercisesByTemplate.get(template.id) ?? []).map(
            ({ templateId: _templateId, ...exercise }) => exercise,
          ),
        })),
      );
    } catch (_e) {
      return c.json({ message: 'Failed to fetch templates' }, 500);
    }
  }),
);

app.post(
  '/api/templates',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { name, description, notes } = body;
      if (!name) {
        return c.json({ message: 'Name is required' }, 400);
      }
      console.log('DEBUG createTemplate:', { userId, name, description, notes });
      const now = new Date();
      const result = await db
        .insert(schema.templates)
        .values({
          userId,
          name,
          description: description || null,
          notes: notes || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      console.log('DEBUG createTemplate result:', JSON.stringify(result));
      return c.json(result, 201);
    } catch (e) {
      console.log('DEBUG createTemplate error:', e);
      return c.json({ message: 'Failed to create template' }, 500);
    }
  }),
);

app.get(
  '/api/templates/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const template = await requireOwnedTemplate({ userId, db }, id);
      if (template instanceof Response) return template;
      const templateExercisesResult = await db
        .select({
          id: schema.templateExercises.id,
          exerciseId: schema.templateExercises.exerciseId,
          orderIndex: schema.templateExercises.orderIndex,
          targetWeight: schema.templateExercises.targetWeight,
          addedWeight: schema.templateExercises.addedWeight,
          sets: schema.templateExercises.sets,
          reps: schema.templateExercises.reps,
          repsRaw: schema.templateExercises.repsRaw,
          isAmrap: schema.templateExercises.isAmrap,
          isAccessory: schema.templateExercises.isAccessory,
          isRequired: schema.templateExercises.isRequired,
          exercise: {
            id: schema.exercises.id,
            name: schema.exercises.name,
            muscleGroup: schema.exercises.muscleGroup,
          },
        })
        .from(schema.templateExercises)
        .innerJoin(schema.exercises, eq(schema.templateExercises.exerciseId, schema.exercises.id))
        .where(eq(schema.templateExercises.templateId, id))
        .orderBy(schema.templateExercises.orderIndex)
        .all();
      return c.json({ ...template, exercises: templateExercisesResult });
    } catch (_e) {
      return c.json({ message: 'Failed to fetch template' }, 500);
    }
  }),
);

app.put(
  '/api/templates/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    console.log('DEBUG updateTemplate:', { id, userId });
    try {
      const body = await c.req.json();
      console.log('DEBUG updateTemplate body:', JSON.stringify(body));
      const existingTemplate = await db
        .select({ id: schema.templates.id })
        .from(schema.templates)
        .where(
          and(
            eq(schema.templates.id, id),
            eq(schema.templates.userId, userId),
            eq(schema.templates.isDeleted, false),
          ),
        )
        .get();

      if (!existingTemplate) {
        console.log('DEBUG updateTemplate result: template not found');
        return c.json({ message: 'Template not found' }, 404);
      }

      await db
        .update(schema.templates)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
        .run();

      const updatedTemplate = await db
        .select()
        .from(schema.templates)
        .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
        .get();

      console.log('DEBUG updateTemplate result:', JSON.stringify(updatedTemplate));

      if (!updatedTemplate) {
        return c.json({ message: 'Failed to update template' }, 500);
      }

      return c.json(updatedTemplate);
    } catch (e) {
      console.log('DEBUG updateTemplate error:', e);
      return c.json({ message: 'Failed to update template' }, 500);
    }
  }),
);

app.delete(
  '/api/templates/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const result = await db
        .update(schema.templates)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
        .run();
      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to delete template' }, 500);
    }
  }),
);

app.get(
  '/api/templates/:id/exercises',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const template = await requireOwnedTemplate({ userId, db }, id);
      if (template instanceof Response) return template;

      const exercises = await db
        .select({
          id: schema.templateExercises.id,
          exerciseId: schema.templateExercises.exerciseId,
          orderIndex: schema.templateExercises.orderIndex,
          targetWeight: schema.templateExercises.targetWeight,
          addedWeight: schema.templateExercises.addedWeight,
          sets: schema.templateExercises.sets,
          reps: schema.templateExercises.reps,
          repsRaw: schema.templateExercises.repsRaw,
          isAmrap: schema.templateExercises.isAmrap,
          isAccessory: schema.templateExercises.isAccessory,
          isRequired: schema.templateExercises.isRequired,
          name: schema.exercises.name,
        })
        .from(schema.templateExercises)
        .innerJoin(schema.exercises, eq(schema.templateExercises.exerciseId, schema.exercises.id))
        .where(eq(schema.templateExercises.templateId, id))
        .orderBy(schema.templateExercises.orderIndex)
        .all();

      return c.json(exercises);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch template exercises' }, 500);
    }
  }),
);

app.post(
  '/api/templates/:id/exercises',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const template = await requireOwnedTemplate({ userId, db }, id);
      if (template instanceof Response) return template;
      const body = await c.req.json();
      const {
        exerciseId,
        orderIndex,
        targetWeight,
        addedWeight,
        sets,
        reps,
        repsRaw,
        isAmrap,
        isAccessory,
        isRequired,
      } = body;
      if (!exerciseId || orderIndex === undefined) {
        return c.json({ message: 'exerciseId and orderIndex are required' }, 400);
      }

      let resolvedExerciseId = exerciseId;

      const existingExercise = await db
        .select({
          id: schema.exercises.id,
          libraryId: schema.exercises.libraryId,
        })
        .from(schema.exercises)
        .where(
          and(
            eq(schema.exercises.userId, userId),
            eq(schema.exercises.isDeleted, false),
            eq(schema.exercises.id, exerciseId),
          ),
        )
        .get();

      if (!existingExercise) {
        const existingLibraryExercise = await db
          .select({
            id: schema.exercises.id,
          })
          .from(schema.exercises)
          .where(
            and(
              eq(schema.exercises.userId, userId),
              eq(schema.exercises.isDeleted, false),
              eq(schema.exercises.libraryId, exerciseId),
            ),
          )
          .get();

        if (existingLibraryExercise) {
          resolvedExerciseId = existingLibraryExercise.id;
        } else {
          const libraryExercise = schema.exerciseLibrary.find(
            (exercise) => exercise.id === exerciseId,
          );

          if (!libraryExercise) {
            return c.json({ message: 'Exercise not found' }, 404);
          }

          const now = new Date();
          const createdExercise = await db
            .insert(schema.exercises)
            .values({
              userId,
              name: libraryExercise.name,
              muscleGroup: libraryExercise.muscleGroup,
              description: libraryExercise.description,
              libraryId: libraryExercise.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: schema.exercises.id })
            .get();

          if (!createdExercise) {
            return c.json({ message: 'Failed to create exercise' }, 500);
          }

          resolvedExerciseId = createdExercise.id;
        }
      }

      const result = await db
        .insert(schema.templateExercises)
        .values({
          templateId: id,
          exerciseId: resolvedExerciseId,
          orderIndex,
          targetWeight: targetWeight || null,
          addedWeight: addedWeight || 0,
          sets: sets || null,
          reps: reps || null,
          repsRaw: repsRaw || null,
          isAmrap: isAmrap || false,
          isAccessory: isAccessory || false,
          isRequired: isRequired !== false,
        })
        .returning()
        .get();
      return c.json(result, 201);
    } catch (e) {
      console.log('DEBUG addTemplateExercise error:', e);
      return c.json({ message: 'Failed to add exercise to template' }, 500);
    }
  }),
);

app.delete(
  '/api/templates/:id/exercises/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const { id, exerciseId } = c.req.param();
    try {
      const template = await requireOwnedTemplate({ userId, db }, id);
      if (template instanceof Response) return template;
      const result = await db
        .delete(schema.templateExercises)
        .where(
          and(
            eq(schema.templateExercises.templateId, id),
            eq(schema.templateExercises.exerciseId, exerciseId),
          ),
        )
        .run();
      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to remove exercise from template' }, 500);
    }
  }),
);

app.post(
  '/api/templates/:id/copy',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const original = await requireOwnedTemplate({ userId, db }, id);
      if (original instanceof Response) return original;
      const now = new Date();
      const newTemplate = await db
        .insert(schema.templates)
        .values({
          userId,
          name: `${original.name} (Copy)`,
          description: original.description,
          notes: original.notes,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      const originalExercises = await db
        .select()
        .from(schema.templateExercises)
        .where(eq(schema.templateExercises.templateId, id))
        .orderBy(schema.templateExercises.orderIndex)
        .all();
      if (originalExercises.length > 0) {
        await chunkedInsert(db, {
          table: schema.templateExercises,
          rows: originalExercises.map((te) => ({
            templateId: newTemplate.id,
            exerciseId: te.exerciseId,
            orderIndex: te.orderIndex,
            targetWeight: te.targetWeight,
            addedWeight: te.addedWeight,
            sets: te.sets,
            reps: te.reps,
            repsRaw: te.repsRaw,
            isAmrap: te.isAmrap,
            isAccessory: te.isAccessory,
            isRequired: te.isRequired,
            setNumber: te.setNumber,
          })),
        });
      }
      return c.json(newTemplate, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to copy template' }, 500);
    }
  }),
);

app.get(
  '/api/workouts',
  createHandler(async (c, { userId, db }) => {
    const limit = parseInt(c.req.query('limit') || '10', 10);
    try {
      const results = await db
        .select({
          id: schema.workouts.id,
          name: schema.workouts.name,
          notes: schema.workouts.notes,
          startedAt: schema.workouts.startedAt,
          completedAt: schema.workouts.completedAt,
          createdAt: schema.workouts.createdAt,
          totalVolume: schema.workouts.totalVolume,
          totalSets: schema.workouts.totalSets,
          durationMinutes: schema.workouts.durationMinutes,
        })
        .from(schema.workouts)
        .where(and(eq(schema.workouts.userId, userId), eq(schema.workouts.isDeleted, false)))
        .orderBy(desc(schema.workouts.startedAt))
        .limit(limit)
        .all();

      const workoutIds = results.map((w) => w.id);
      if (workoutIds.length === 0) {
        return c.json(results.map((w) => ({ ...w, exerciseCount: 0 })));
      }

      const exerciseCounts = await chunkedQuery(db, {
        ids: workoutIds,
        mergeKey: 'workoutId',
        builder: (chunk) =>
          db
            .select({
              workoutId: schema.workoutExercises.workoutId,
              exerciseCount: sql<number>`count(${schema.workoutExercises.id})`,
            })
            .from(schema.workoutExercises)
            .where(inArray(schema.workoutExercises.workoutId, chunk))
            .groupBy(schema.workoutExercises.workoutId)
            .all(),
      });

      const exerciseCountMap = new Map(
        exerciseCounts.map((ec) => [ec.workoutId, ec.exerciseCount]),
      );

      return c.json(
        results.map((w) => ({
          ...w,
          exerciseCount: exerciseCountMap.get(w.id) ?? 0,
        })),
      );
    } catch (_e) {
      return c.json({ message: 'Failed to fetch workouts' }, 500);
    }
  }),
);

app.post(
  '/api/workouts',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { name, templateId, notes } = body;
      if (!name) {
        return c.json({ message: 'Name is required' }, 400);
      }

      const now = new Date();
      if (templateId) {
        const template = await requireOwnedTemplate({ userId, db }, templateId);
        if (template instanceof Response) return template;
      }

      const workout = await db
        .insert(schema.workouts)
        .values({
          userId,
          name,
          templateId: templateId || null,
          notes: notes || null,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      if (templateId) {
        const templateExercisesResult = await db
          .select()
          .from(schema.templateExercises)
          .where(eq(schema.templateExercises.templateId, templateId))
          .orderBy(schema.templateExercises.orderIndex)
          .all();
        for (let i = 0; i < templateExercisesResult.length; i++) {
          const templateExercise = templateExercisesResult[i];
          const workoutExercise = await db
            .insert(schema.workoutExercises)
            .values({
              workoutId: workout.id,
              exerciseId: templateExercise.exerciseId,
              orderIndex: i,
              isAmrap: templateExercise.isAmrap ?? false,
              updatedAt: now,
            })
            .returning()
            .get();
          const historySnapshot = await getLastCompletedExerciseSnapshot(
            db,
            userId,
            templateExercise.exerciseId,
          );

          const setRows =
            historySnapshot && historySnapshot.sets.length > 0
              ? historySnapshot.sets.map(
                  (
                    set: { weight: number | null; reps: number | null; rpe: number | null },
                    index: number,
                  ) => ({
                    workoutExerciseId: workoutExercise.id,
                    setNumber: index + 1,
                    weight: set.weight,
                    reps: set.reps,
                    rpe: set.rpe,
                    isComplete: false,
                    createdAt: now,
                    updatedAt: now,
                  }),
                )
              : Array.from({ length: templateExercise.sets ?? 3 }, (_, s) => ({
                  workoutExerciseId: workoutExercise.id,
                  setNumber: s + 1,
                  weight:
                    (templateExercise.targetWeight ?? 0) + (templateExercise.addedWeight ?? 0),
                  reps: templateExercise.isAmrap ? null : (templateExercise.reps ?? 0),
                  isComplete: false,
                  createdAt: now,
                  updatedAt: now,
                }));

          await chunkedInsert(db, { table: schema.workoutSets, rows: setRows });
        }
      }
      return c.json(workout, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to create workout' }, 500);
    }
  }),
);

app.get(
  '/api/workouts/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const workout = await requireOwnedWorkout({ userId, db }, id);
      if (workout instanceof Response) return workout;
      const aggregates = await db
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
        .where(eq(schema.workoutExercises.workoutId, id))
        .get();
      const exercisesResult = await db
        .select({
          id: schema.workoutExercises.id,
          exerciseId: schema.workoutExercises.exerciseId,
          orderIndex: schema.workoutExercises.orderIndex,
          notes: schema.workoutExercises.notes,
          isAmrap: schema.workoutExercises.isAmrap,
          name: schema.exercises.name,
          muscleGroup: schema.exercises.muscleGroup,
        })
        .from(schema.workoutExercises)
        .innerJoin(schema.exercises, eq(schema.workoutExercises.exerciseId, schema.exercises.id))
        .where(eq(schema.workoutExercises.workoutId, id))
        .orderBy(schema.workoutExercises.orderIndex)
        .all();

      const exerciseIds = exercisesResult.map((e: any) => e.id);
      const allSets = await chunkedQueryMany(db, {
        ids: exerciseIds,
        chunkSize: 100,
        builder: (chunk) =>
          db
            .select({
              id: schema.workoutSets.id,
              workoutExerciseId: schema.workoutSets.workoutExerciseId,
              setNumber: schema.workoutSets.setNumber,
              weight: schema.workoutSets.weight,
              reps: schema.workoutSets.reps,
              rpe: schema.workoutSets.rpe,
              isComplete: schema.workoutSets.isComplete,
              completedAt: schema.workoutSets.completedAt,
              createdAt: schema.workoutSets.createdAt,
            })
            .from(schema.workoutSets)
            .where(inArray(schema.workoutSets.workoutExerciseId, chunk))
            .orderBy(schema.workoutSets.setNumber)
            .all(),
      });

      const setsByExerciseId = new Map<string, any[]>();
      for (const set of allSets) {
        const eid = set.workoutExerciseId as string;
        if (!setsByExerciseId.has(eid)) setsByExerciseId.set(eid, []);
        setsByExerciseId.get(eid)!.push(set);
      }

      const exercisesWithSets = exercisesResult.map((e: any) => ({
        ...e,
        sets: setsByExerciseId.get(e.id) ?? [],
      }));

      return c.json({
        ...workout,
        totalVolume: aggregates?.totalVolume ?? 0,
        totalSets: aggregates?.totalSets ?? 0,
        durationMinutes: workout.durationMinutes ?? 0,
        exerciseCount: aggregates?.exerciseCount ?? 0,
        exercises: exercisesWithSets,
      });
    } catch (_e) {
      return c.json({ message: 'Failed to fetch workout' }, 500);
    }
  }),
);

app.put(
  '/api/workouts/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const body = await c.req.json();
      const result = await db
        .update(schema.workouts)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
        .returning()
        .get();
      if (!result) {
        return c.json({ message: 'Workout not found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to update workout' }, 500);
    }
  }),
);

app.delete(
  '/api/workouts/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const now = new Date();
      const result = await db
        .update(schema.workouts)
        .set({ isDeleted: true, updatedAt: now })
        .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
        .run();

      await db
        .update(schema.programCycleWorkouts)
        .set({
          workoutId: null,
          updatedAt: now,
        })
        .where(eq(schema.programCycleWorkouts.workoutId, id))
        .run();

      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to delete workout' }, 500);
    }
  }),
);

app.put(
  '/api/workouts/:id/complete',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const workout = await db
        .select({ startedAt: schema.workouts.startedAt })
        .from(schema.workouts)
        .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
        .get();
      if (!workout) {
        return c.json({ message: 'Workout not found' }, 404);
      }
      const now = new Date();
      const aggregates = await db
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
        .where(eq(schema.workoutExercises.workoutId, id))
        .get();
      const elapsedMs = now.getTime() - new Date(workout.startedAt).getTime();
      const rawMinutes = Math.round(elapsedMs / 60000);
      const durationMinutes = rawMinutes > 0 && rawMinutes <= 1440 ? rawMinutes : null;
      const result = await db
        .update(schema.workouts)
        .set({
          completedAt: now,
          totalVolume: aggregates?.totalVolume ?? 0,
          totalSets: aggregates?.totalSets ?? 0,
          durationMinutes,
          updatedAt: now,
        })
        .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
        .returning()
        .get();

      await advanceProgramCycleForWorkout(db, userId, id);

      return c.json({ ...result, exerciseCount: aggregates?.exerciseCount ?? 0 });
    } catch (_e) {
      return c.json({ message: 'Failed to complete workout' }, 500);
    }
  }),
);

app.post(
  '/api/workouts/:id/exercises',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const workout = await requireOwnedWorkout({ userId, db }, id);
      if (workout instanceof Response) return workout;
      const body = await c.req.json();
      const { exerciseId, orderIndex } = body;
      if (!exerciseId || orderIndex === undefined) {
        return c.json({ message: 'exerciseId and orderIndex are required' }, 400);
      }
      const resolvedExerciseId = await resolveToUserExerciseId(db, userId, exerciseId);
      const now = new Date();
      const result = await db
        .insert(schema.workoutExercises)
        .values({
          workoutId: id,
          exerciseId: resolvedExerciseId,
          orderIndex,
          updatedAt: now,
        })
        .returning()
        .get();
      return c.json(result, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to add exercise to workout' }, 500);
    }
  }),
);

app.delete(
  '/api/workouts/:id/exercises/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const { id, exerciseId } = c.req.param();
    try {
      const workout = await requireOwnedWorkout({ userId, db }, id);
      if (workout instanceof Response) return workout;
      const result = await db
        .delete(schema.workoutExercises)
        .where(
          and(
            eq(schema.workoutExercises.workoutId, id),
            eq(schema.workoutExercises.exerciseId, exerciseId),
          ),
        )
        .run();
      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to remove exercise from workout' }, 500);
    }
  }),
);

app.post(
  '/api/workouts/sets',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { workoutExerciseId, setNumber, weight, reps, rpe, isComplete } = body;
      if (!workoutExerciseId || setNumber === undefined) {
        return c.json({ message: 'workoutExerciseId and setNumber are required' }, 400);
      }
      const we = await requireOwnedWorkoutExercise({ userId, db }, workoutExerciseId);
      if (we instanceof Response) return we;

      const now = new Date();
      const result = await db
        .insert(schema.workoutSets)
        .values({
          workoutExerciseId,
          setNumber,
          weight: weight || null,
          reps: reps || null,
          rpe: rpe || null,
          isComplete: isComplete || false,
          ...(isComplete ? { completedAt: now } : {}),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return c.json(result, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to create set' }, 500);
    }
  }),
);

app.put(
  '/api/workouts/sets/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const set = await requireOwnedWorkoutSet({ userId, db }, id);
      if (set instanceof Response) return set;
      const body = await c.req.json();
      const updateData: any = { ...body, updatedAt: new Date() };
      if (body.isComplete === true) {
        updateData.completedAt = new Date();
      } else if (body.isComplete === false) {
        updateData.completedAt = null;
      }
      delete updateData.timezone;
      const result = await db
        .update(schema.workoutSets)
        .set(updateData)
        .where(eq(schema.workoutSets.id, id))
        .returning()
        .get();
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to update set' }, 500);
    }
  }),
);

app.delete(
  '/api/workouts/sets/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const set = await requireOwnedWorkoutSet({ userId, db }, id);
      if (set instanceof Response) return set;
      const result = await db.delete(schema.workoutSets).where(eq(schema.workoutSets.id, id)).run();
      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to delete set' }, 500);
    }
  }),
);

app.get(
  '/api/workouts/last/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const exerciseId = c.req.param('exerciseId') as string;
    try {
      const snapshot = await getLastCompletedExerciseSnapshot(db, userId, exerciseId);

      if (!snapshot) {
        return c.json(null);
      }

      return c.json({
        exerciseId: snapshot.exerciseId,
        workoutDate: snapshot.workoutDate,
        sets: snapshot.sets.map(
          (set: { weight: number | null; reps: number | null; rpe: number | null }) => ({
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
          }),
        ),
      });
    } catch (_e) {
      return c.json({ message: 'Failed to fetch last workout data' }, 500);
    }
  }),
);

app.get('/api/programs', async (c) => {
  const { PROGRAMS } = await import('./programs');
  const programsList = Object.values(PROGRAMS).map((p) => ({
    slug: p.info.slug,
    name: p.info.name,
    description: p.info.description,
    difficulty: p.info.difficulty,
    daysPerWeek: p.info.daysPerWeek,
    estimatedWeeks: p.info.estimatedWeeks,
    totalSessions: p.info.totalSessions,
    mainLifts: p.info.mainLifts,
  }));
  return c.json(programsList);
});

app.get(
  '/api/programs/latest-1rms',
  createHandler(async (c, { userId, db }) => {
    try {
      const latestOneRMs = await getLatestOneRMsForUser(db, userId);
      return c.json(latestOneRMs);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch latest 1RMs' }, 500);
    }
  }),
);

app.post(
  '/api/programs',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const {
        programSlug,
        name,
        squat1rm,
        bench1rm,
        deadlift1rm,
        ohp1rm,
        preferredGymDays,
        preferredTimeOfDay,
        programStartDate,
        firstSessionDate,
      } = body;
      if (!programSlug || !name) {
        return c.json({ message: 'programSlug and name are required' }, 400);
      }

      const programConfig = getProgram(programSlug);
      if (!programConfig) {
        return c.json({ message: 'Program not found' }, 404);
      }

      const oneRMs = {
        squat: squat1rm || 0,
        bench: bench1rm || 0,
        deadlift: deadlift1rm || 0,
        ohp: ohp1rm || 0,
      };

      const generatedWorkouts = programConfig.generateWorkouts(oneRMs);

      const profileTimezone = await getStoredUserTimezone(db, userId);
      const timezone = profileTimezone ?? 'UTC';

      const startDate = programStartDate ? new Date(programStartDate) : new Date();
      const firstDate = firstSessionDate ? new Date(firstSessionDate) : undefined;
      const programStartAt = startDate.getTime();

      const scheduleOptions = {
        preferredDays: preferredGymDays || ['monday', 'wednesday', 'friday'],
        preferredTimeOfDay: preferredTimeOfDay || 'morning',
      };

      const schedule = generateWorkoutSchedule(
        generatedWorkouts.map((w) => ({
          weekNumber: w.weekNumber,
          sessionNumber: w.sessionNumber,
          sessionName: w.sessionName,
        })),
        startDate,
        { ...scheduleOptions, forceFirstSessionDate: firstDate },
      );

      const exerciseResolutionTasks: Array<{
        workoutIndex: number;
        exerciseIndex: number;
        name: string;
        lift?: string;
        libraryId?: string;
      }> = [];
      for (let wi = 0; wi < generatedWorkouts.length; wi++) {
        const workout = generatedWorkouts[wi];
        for (let ei = 0; ei < (workout.exercises ?? []).length; ei++) {
          const e = workout.exercises[ei];
          if (e.libraryId) {
            exerciseResolutionTasks.push({
              workoutIndex: wi,
              exerciseIndex: ei,
              name: e.name,
              lift: e.lift,
              libraryId: e.libraryId,
            });
          }
        }
      }

      const resolvedExercises = await batchParallel(
        exerciseResolutionTasks.map(
          (t) => () =>
            getOrCreateExerciseForUser(
              db,
              userId,
              t.name,
              t.lift as 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row' | undefined,
              t.libraryId,
            ),
        ),
      );

      const exerciseIdMap: Map<string, string> = new Map();
      for (let i = 0; i < exerciseResolutionTasks.length; i++) {
        const key = `${exerciseResolutionTasks[i].workoutIndex}_${exerciseResolutionTasks[i].exerciseIndex}`;
        exerciseIdMap.set(key, resolvedExercises[i]);
      }

      const workouts = generatedWorkouts.map((workout, workoutIndex) => {
        const scheduleEntry = schedule[workoutIndex];
        const exercises = (workout.exercises ?? []).map((e, exerciseIndex) => {
          const key = `${workoutIndex}_${exerciseIndex}`;
          return {
            name: e.name,
            lift: e.lift,
            targetWeight: e.targetWeight,
            sets: e.sets,
            reps: e.reps,
            isAmrap: e.isAmrap ?? false,
            isAccessory: false,
            libraryId: e.libraryId,
            exerciseId: exerciseIdMap.get(key),
          };
        });
        const accessories = (workout.accessories || []).map((a) => ({
          name: a.name,
          accessoryId: a.accessoryId,
          targetWeight: a.targetWeight,
          sets: a.sets,
          reps: a.reps,
          isAmrap: a.isAmrap ?? false,
          isAccessory: true,
        }));
        return {
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          sessionName: workout.sessionName,
          scheduledAt:
            scheduleEntry?.scheduledDate instanceof Date &&
            !isNaN(scheduleEntry.scheduledDate.getTime())
              ? scheduleEntry.scheduledDate.getTime()
              : undefined,
          targetLifts: JSON.stringify({
            exercises,
            accessories,
          }),
        };
      });

      const totalSessionsPlanned = generatedWorkouts.length;
      const estimatedWeeks = programConfig.info.estimatedWeeks;

      const cycle = await createProgramCycle(db, userId, {
        programSlug,
        name,
        squat1rm: squat1rm || 0,
        bench1rm: bench1rm || 0,
        deadlift1rm: deadlift1rm || 0,
        ohp1rm: ohp1rm || 0,
        totalSessionsPlanned,
        estimatedWeeks,
        preferredGymDays,
        preferredTimeOfDay,
        programStartAt,
        firstSessionAt: firstDate?.getTime(),
        workouts,
      });

      return c.json(cycle, 201);
    } catch (_e) {
      console.error('Failed to start program:', _e);
      return c.json({ message: 'Failed to start program' }, 500);
    }
  }),
);

app.get(
  '/api/programs/active',
  createHandler(async (c, { userId, db }) => {
    try {
      const result = await db
        .select()
        .from(schema.userProgramCycles)
        .where(
          and(
            eq(schema.userProgramCycles.userId, userId),
            eq(schema.userProgramCycles.status, 'active'),
          ),
        )
        .orderBy(desc(schema.userProgramCycles.startedAt))
        .all();
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch active program' }, 500);
    }
  }),
);

app.delete(
  '/api/programs/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const deleted = await softDeleteProgramCycle(db, cycleId, userId);
      if (!deleted) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      return c.json({ success: true });
    } catch (_e) {
      return c.json({ message: 'Failed to delete program cycle' }, 500);
    }
  }),
);

app.put(
  '/api/programs/active',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { currentWeek, currentSession } = body;
      const result = await db
        .update(schema.userProgramCycles)
        .set({
          ...(currentWeek !== undefined && { currentWeek }),
          ...(currentSession !== undefined && { currentSession }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userProgramCycles.userId, userId),
            eq(schema.userProgramCycles.status, 'active'),
          ),
        )
        .returning()
        .get();
      if (!result) {
        return c.json({ message: 'No active program found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to update program cycle' }, 500);
    }
  }),
);

app.get(
  '/api/programs/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch program cycle' }, 500);
    }
  }),
);

app.get(
  '/api/programs/cycles/:id/schedule',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const ownedCycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (ownedCycle instanceof Response) return ownedCycle;

      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      const { cycle, workouts } = result;
      const profileTimezone = await getStoredUserTimezone(db, userId);
      const timezone = profileTimezone ?? 'UTC';
      const { start: todayStart, end: todayEnd } = getUtcRangeForLocalDate(
        formatLocalDate(new Date(), timezone),
        timezone,
      );

      const workoutIds = workouts.filter((w) => w.workoutId).map((w) => w.workoutId as string);

      const linkedWorkouts =
        workoutIds.length > 0
          ? await db
              .select({ id: schema.workouts.id, completedAt: schema.workouts.completedAt })
              .from(schema.workouts)
              .where(
                and(inArray(schema.workouts.id, workoutIds), eq(schema.workouts.userId, userId)),
              )
              .all()
          : [];

      const linkedWorkoutMap = new Map(linkedWorkouts.map((w) => [w.id, w]));

      const thisWeek: any[] = [];
      const upcoming: any[] = [];
      const completed: any[] = [];

      for (const workout of workouts) {
        const linkedWorkout = workout.workoutId
          ? linkedWorkoutMap.get(workout.workoutId)
          : undefined;
        const isWorkoutComplete = workout.isComplete || !!linkedWorkout?.completedAt;
        const parsedTargetLifts = parseProgramTargetLifts(workout.targetLifts);
        const exercises = parsedTargetLifts.all.map((l) => l.name);

        if (!workout.scheduledAt) {
          const scheduleWorkout = {
            cycleWorkoutId: workout.id,
            workoutId: workout.workoutId ?? null,
            weekNumber: workout.weekNumber,
            sessionNumber: workout.sessionNumber,
            name: workout.sessionName,
            exercises,
            scheduledAt: null,
            status: isWorkoutComplete ? 'complete' : 'unscheduled',
          };
          if (isWorkoutComplete) {
            completed.push(scheduleWorkout);
          }
          continue;
        }

        const scheduledTime = workout.scheduledAt;
        if (isWorkoutComplete) {
          completed.push({
            cycleWorkoutId: workout.id,
            workoutId: workout.workoutId ?? null,
            weekNumber: workout.weekNumber,
            sessionNumber: workout.sessionNumber,
            name: workout.sessionName,
            exercises,
            scheduledAt: scheduledTime,
            status: 'complete' as const,
          });
        } else if (scheduledTime >= todayStart.getTime() && scheduledTime < todayEnd.getTime()) {
          thisWeek.push({
            cycleWorkoutId: workout.id,
            workoutId: workout.workoutId ?? null,
            weekNumber: workout.weekNumber,
            sessionNumber: workout.sessionNumber,
            name: workout.sessionName,
            exercises,
            scheduledAt: scheduledTime,
            status: 'today' as const,
          });
        } else if (scheduledTime >= todayEnd.getTime()) {
          upcoming.push({
            cycleWorkoutId: workout.id,
            workoutId: workout.workoutId ?? null,
            weekNumber: workout.weekNumber,
            sessionNumber: workout.sessionNumber,
            name: workout.sessionName,
            exercises,
            scheduledAt: scheduledTime,
            status: 'upcoming' as const,
          });
        }
      }

      return c.json({
        cycle: {
          id: cycle.id,
          name: cycle.name,
          timezone,
          currentWeek: cycle.currentWeek ?? null,
          currentSession: cycle.currentSession ?? null,
          totalSessionsCompleted: cycle.totalSessionsCompleted,
          totalSessionsPlanned: cycle.totalSessionsPlanned,
        },
        thisWeek,
        upcoming,
        completed,
      });
    } catch (_e) {
      console.error('Failed to fetch program cycle schedule:', _e);
      return c.json({ message: 'Failed to fetch program cycle schedule' }, 500);
    }
  }),
);

app.put(
  '/api/programs/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const ownedCycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (ownedCycle instanceof Response) return ownedCycle;

      const body = await c.req.json();
      const { squat1rm, bench1rm, deadlift1rm, ohp1rm, currentWeek, currentSession, isComplete } =
        body;

      let updated = null;
      const hasOneRMUpdate =
        squat1rm !== undefined ||
        bench1rm !== undefined ||
        deadlift1rm !== undefined ||
        ohp1rm !== undefined;

      if (hasOneRMUpdate) {
        updated = await updateProgramCycleOneRMs(db, userId, cycleId, {
          squat1rm,
          bench1rm,
          deadlift1rm,
          ohp1rm,
        });
      }

      if (currentWeek !== undefined || currentSession !== undefined || isComplete === true) {
        const cycle = await getProgramCycleById(db, cycleId, userId);
        if (!cycle) {
          return c.json({ message: 'Program cycle not found' }, 404);
        }

        updated = await db
          .update(schema.userProgramCycles)
          .set({
            ...(currentWeek !== undefined && { currentWeek }),
            ...(currentSession !== undefined && { currentSession }),
            ...(isComplete === true && {
              isComplete: true,
              status: 'completed',
              completedAt: new Date(),
            }),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.userProgramCycles.id, cycleId),
              eq(schema.userProgramCycles.userId, userId),
            ),
          )
          .returning()
          .get();
      }

      if (!updated) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      return c.json(updated);
    } catch (_e) {
      return c.json({ message: 'Failed to update program cycle' }, 500);
    }
  }),
);

app.get(
  '/api/programs/cycles/:id/workouts',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }
      return c.json(result.workouts);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch workouts' }, 500);
    }
  }),
);

app.get(
  '/api/programs/cycles/:id/workouts/current',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }
      const currentWorkout = getCurrentCycleWorkout(result.cycle, result.workouts);
      if (!currentWorkout) {
        return c.json({ message: 'Current workout not found' }, 404);
      }
      const parsedTargetLifts = parseProgramTargetLifts(currentWorkout.targetLifts);

      return c.json({
        id: currentWorkout.id,
        weekNumber: currentWorkout.weekNumber,
        sessionNumber: currentWorkout.sessionNumber,
        sessionName: currentWorkout.sessionName,
        isComplete: currentWorkout.isComplete,
        scheduledAt: currentWorkout.scheduledAt,
        exercises: parsedTargetLifts.all.map((exercise, index) => ({
          id: `${currentWorkout.id}:${index}`,
          orderIndex: index,
          targetWeight: exercise.targetWeight,
          addedWeight: exercise.addedWeight,
          sets: exercise.sets,
          reps:
            typeof exercise.reps === 'number' ? exercise.reps : normalizeProgramReps(exercise.reps),
          repsRaw: typeof exercise.reps === 'string' ? exercise.reps : null,
          isAmrap: exercise.isAmrap,
          isAccessory: exercise.isAccessory,
          isRequired: exercise.isRequired,
          exercise: {
            id: exercise.accessoryId ?? exercise.lift ?? exercise.name,
            name: exercise.name,
            muscleGroup: null,
          },
        })),
      });
    } catch (_e) {
      return c.json({ message: 'Failed to fetch current workout' }, 500);
    }
  }),
);

app.post(
  '/api/programs/cycles/:id/create-1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const body = await c.req.json().catch(() => ({}));
      const workout = await createOneRMTestWorkout(db, userId, cycleId);
      if (!workout) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      return c.json({ workoutId: workout.id, workoutName: workout.name }, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to create 1RM test workout' }, 500);
    }
  }),
);

app.get(
  '/api/programs/cycles/:id/1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const workout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
      if (!workout) {
        return c.json({ message: '1RM test workout not found' }, 404);
      }

      return c.json(workout);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch 1RM test workout' }, 500);
    }
  }),
);

app.put(
  '/api/programs/cycles/:id/1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const body = await c.req.json();
      const shouldCompleteCycle = body.isComplete === true;
      const workout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
      if (!workout) {
        return c.json({ message: '1RM test workout not found' }, 404);
      }

      const updatedWorkout = await db
        .update(schema.workouts)
        .set({
          squat1rm: body.squat1rm,
          bench1rm: body.bench1rm,
          deadlift1rm: body.deadlift1rm,
          ohp1rm: body.ohp1rm,
          startingSquat1rm: body.startingSquat1rm,
          startingBench1rm: body.startingBench1rm,
          startingDeadlift1rm: body.startingDeadlift1rm,
          startingOhp1rm: body.startingOhp1rm,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.workouts.id, workout.id), eq(schema.workouts.userId, userId)))
        .returning()
        .get();

      await updateProgramCycleOneRMs(db, userId, cycleId, {
        squat1rm: body.squat1rm,
        bench1rm: body.bench1rm,
        deadlift1rm: body.deadlift1rm,
        ohp1rm: body.ohp1rm,
      });

      if (shouldCompleteCycle) {
        await db
          .update(schema.userProgramCycles)
          .set({
            isComplete: true,
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.userProgramCycles.id, cycleId),
              eq(schema.userProgramCycles.userId, userId),
            ),
          )
          .run();
      }

      return c.json(updatedWorkout);
    } catch (_e) {
      return c.json({ message: 'Failed to update 1RM test workout' }, 500);
    }
  }),
);

app.post(
  '/api/programs/cycles/:id/workouts/current/start',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const body = await c.req.json().catch(() => ({}));
      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      const currentCycleWorkout = getCurrentCycleWorkout(result.cycle, result.workouts);

      if (!currentCycleWorkout) {
        return c.json({ message: 'Current workout not found' }, 404);
      }

      if (currentCycleWorkout.workoutId) {
        const existingWorkout = await db
          .select({
            id: schema.workouts.id,
            completedAt: schema.workouts.completedAt,
            isDeleted: schema.workouts.isDeleted,
          })
          .from(schema.workouts)
          .where(
            and(
              eq(schema.workouts.id, currentCycleWorkout.workoutId),
              eq(schema.workouts.userId, userId),
            ),
          )
          .get();

        if (existingWorkout && !existingWorkout.isDeleted) {
          return c.json({
            workoutId: existingWorkout.id,
            created: false,
            completed: !!existingWorkout.completedAt,
          });
        }
      }

      const workout = await createWorkoutFromProgramCycleWorkout(
        db,
        userId,
        cycleId,
        currentCycleWorkout,
      );

      return c.json({
        workoutId: workout.id,
        sessionName: workout.name,
        created: true,
        completed: false,
      });
    } catch (e) {
      console.error('Failed to start current workout:', e);
      return c.json({ message: 'Failed to start current workout' }, 500);
    }
  }),
);

app.post(
  '/api/programs/cycle-workouts/:cycleWorkoutId/start',
  createHandler(async (c, { userId, db }) => {
    const cycleWorkoutId = c.req.param('cycleWorkoutId') as string;

    try {
      const body = await c.req.json().catch(() => ({}));
      const cycleWorkout = await requireOwnedProgramCycleWorkout({ userId, db }, cycleWorkoutId);
      if (cycleWorkout instanceof Response) return cycleWorkout;

      if (cycleWorkout.workoutId) {
        const existingWorkout = await db
          .select({
            id: schema.workouts.id,
            completedAt: schema.workouts.completedAt,
            isDeleted: schema.workouts.isDeleted,
          })
          .from(schema.workouts)
          .where(
            and(eq(schema.workouts.id, cycleWorkout.workoutId), eq(schema.workouts.userId, userId)),
          )
          .get();

        if (existingWorkout && !existingWorkout.isDeleted) {
          return c.json({
            workoutId: existingWorkout.id,
            sessionName: cycleWorkout.sessionName,
            created: false,
            completed: !!existingWorkout.completedAt,
            programCycleId: cycleWorkout.cycleId,
          });
        }
      }

      const workout = await createWorkoutFromProgramCycleWorkout(
        db,
        userId,
        cycleWorkout.cycleId,
        cycleWorkout,
      );

      return c.json({
        workoutId: workout.id,
        sessionName: workout.name,
        created: true,
        completed: false,
        programCycleId: cycleWorkout.cycleId,
      });
    } catch (e) {
      console.error('Failed to start workout:', e);
      return c.json({ message: 'Failed to start workout' }, 500);
    }
  }),
);

app.post(
  '/api/programs/cycles/:id/complete-session',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycleData = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycleData instanceof Response) return cycleData;

      const totalSessionsCompleted = cycleData.totalSessionsCompleted ?? 0;
      const newSessionsCompleted = totalSessionsCompleted + 1;
      const cycleWorkouts = await db
        .select({
          id: schema.programCycleWorkouts.id,
          weekNumber: schema.programCycleWorkouts.weekNumber,
          sessionNumber: schema.programCycleWorkouts.sessionNumber,
        })
        .from(schema.programCycleWorkouts)
        .where(eq(schema.programCycleWorkouts.cycleId, cycleId))
        .orderBy(schema.programCycleWorkouts.weekNumber, schema.programCycleWorkouts.sessionNumber)
        .all();

      const nextCycleWorkout = cycleWorkouts[newSessionsCompleted] ?? null;

      const result = await db
        .update(schema.userProgramCycles)
        .set({
          ...(nextCycleWorkout
            ? {
                currentWeek: nextCycleWorkout.weekNumber,
                currentSession: nextCycleWorkout.sessionNumber,
              }
            : {
                status: 'completed',
                isComplete: true,
                completedAt: new Date(),
              }),
          totalSessionsCompleted: newSessionsCompleted,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userProgramCycles.id, cycleId),
            eq(schema.userProgramCycles.userId, userId),
          ),
        )
        .returning()
        .get();

      if (!result) {
        return c.json({ message: 'Failed to update program cycle' }, 500);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to complete session' }, 500);
    }
  }),
);

app.put(
  '/api/programs/cycle-workouts/:cycleWorkoutId/schedule',
  createHandler(async (c, { userId, db }) => {
    const cycleWorkoutId = c.req.param('cycleWorkoutId') as string;

    try {
      const body = await c.req.json();
      const { scheduledAt } = body as { scheduledAt?: number };

      if (scheduledAt === undefined) {
        return c.json({ message: 'scheduledAt is required' }, 400);
      }

      if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)) {
        return c.json({ message: 'scheduledAt must be a valid timestamp' }, 400);
      }

      const cycleWorkout = await requireOwnedProgramCycleWorkout({ userId, db }, cycleWorkoutId);
      if (cycleWorkout instanceof Response) return cycleWorkout;

      const { start: dayStart, end: dayEnd } = getUtcRangeForLocalDate(
        formatLocalDate(new Date(), 'UTC'),
        'UTC',
      );
      let warning: 'date_collision' | undefined;
      const existingScheduledAt = cycleWorkout.scheduledAt;
      if (
        existingScheduledAt === null ||
        existingScheduledAt === undefined ||
        scheduledAt < dayStart.getTime() ||
        scheduledAt >= dayEnd.getTime()
      ) {
      } else {
        const collision = await db
          .select({ id: schema.programCycleWorkouts.id })
          .from(schema.programCycleWorkouts)
          .innerJoin(
            schema.userProgramCycles,
            eq(schema.programCycleWorkouts.cycleId, schema.userProgramCycles.id),
          )
          .where(
            and(
              eq(schema.userProgramCycles.userId, userId),
              sql`${schema.programCycleWorkouts.scheduledAt} >= ${dayStart.getTime()}`,
              sql`${schema.programCycleWorkouts.scheduledAt} < ${dayEnd.getTime()}`,
              sql`${schema.programCycleWorkouts.id} != ${cycleWorkoutId}`,
            ),
          )
          .get();

        if (collision) {
          warning = 'date_collision';
        }
      }

      const updated = await db
        .update(schema.programCycleWorkouts)
        .set({ scheduledAt: new Date(scheduledAt), updatedAt: new Date() })
        .where(eq(schema.programCycleWorkouts.id, cycleWorkoutId))
        .returning()
        .get();

      const workout = {
        id: updated.id,
        cycleId: updated.cycleId,
        weekNumber: updated.weekNumber,
        sessionNumber: updated.sessionNumber,
        sessionName: updated.sessionName,
        targetLifts: updated.targetLifts,
        isComplete: updated.isComplete,
        workoutId: updated.workoutId,
        scheduledAt: updated.scheduledAt,
      };

      return c.json({ workout, ...(warning ? { warning } : {}) });
    } catch (_e) {
      console.log('DEBUG scheduleCycleWorkout error:', _e);
      return c.json({ message: 'Failed to schedule workout' }, 500);
    }
  }),
);

// WHOOP Integration Routes

app.get('/connect-whoop', (c) => {
  const success = c.req.query('success');
  const error = c.req.query('error');

  const title = success ? 'WHOOP Connected' : 'WHOOP Connection Failed';
  const message = success
    ? 'Your WHOOP account was connected successfully. You can return to the app now.'
    : `The WHOOP connection did not complete.${error ? ` Error: ${error}` : ''}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1110;
        color: #f5f5f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        padding: 32px;
        border-radius: 24px;
        background: #121918;
        border: 1px solid #26302d;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.24);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: #b7c0bd;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`;

  return c.html(html);
});

// POST /api/whoop/auth - Get OAuth authorization URL
app.post(
  '/api/whoop/auth',
  createHandler(async (c, { userId, db }) => {
    const resolvedEnv = resolveWorkerEnv(c.env);

    const connected = await isWhoopConnected(db, userId);
    if (connected) {
      return c.json({ message: 'WHOOP already connected', connected: true }, 200);
    }

    if (!resolvedEnv.WHOOP_CLIENT_ID) {
      console.error('[WHOOP] Missing WHOOP_CLIENT_ID in worker environment');
      return c.json({ error: 'WHOOP_CLIENT_ID is missing from the worker environment' }, 500);
    }

    let returnTo: string | undefined;
    try {
      const body = await c.req.json<{ returnTo?: string }>();
      if (typeof body.returnTo === 'string' && body.returnTo.trim().length > 0) {
        returnTo = body.returnTo.trim();
      }
    } catch {}

    const baseURL = resolveWhoopRedirectBaseURL(resolvedEnv, c.req.url);
    if (!baseURL) {
      return c.json(
        { error: 'WORKER_BASE_URL is not configured and no request base URL was available' },
        500,
      );
    }
    if (!isAllowedWhoopRedirectBaseURL(baseURL)) {
      return c.json(
        {
          error: 'invalid_whoop_redirect_uri',
          message:
            'WHOOP requires an HTTPS redirect URI unless the host is localhost. Use an HTTPS tunnel for Expo Go on a physical device.',
          redirectUri: `${baseURL}/api/auth/whoop/callback`,
        },
        400,
      );
    }
    const redirectUri = `${baseURL}/api/auth/whoop/callback`;
    if (!resolvedEnv.BETTER_AUTH_SECRET) {
      return c.json({ error: 'BETTER_AUTH_SECRET is missing from the worker environment' }, 500);
    }

    const state = await encodeWhoopOAuthState(resolvedEnv.BETTER_AUTH_SECRET, {
      nonce: crypto.randomUUID(),
      userId,
      ...(returnTo ? { returnTo } : {}),
    });

    const authUrl = buildWhoopAuthorizationUrl(resolvedEnv, state, redirectUri);
    console.info('[WHOOP] Authorization URL generated', {
      redirectUri,
      requestUrl: c.req.url,
      configuredBaseURL: resolveBaseURL(resolvedEnv),
      returnTo,
    });

    return c.json({ authUrl, state });
  }),
);

// GET /api/auth/whoop/callback - OAuth callback
app.get('/api/auth/whoop/callback', async (c) => {
  const resolvedEnv = resolveWorkerEnv(c.env);
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');
  const errorUri = c.req.query('error_uri');
  const decodedState = await decodeWhoopOAuthState(resolvedEnv.BETTER_AUTH_SECRET, state);
  const deepLink = decodedState.returnTo ?? 'strength://whoop-callback';

  if (error) {
    console.warn('[WHOOP] Callback returned OAuth error', {
      error,
      errorDescription,
      errorUri,
      requestUrl: c.req.url,
    });
    return c.redirect(
      buildWhoopCallbackRedirect(deepLink, {
        error: errorDescription ?? error,
      }),
    );
  }

  if (!code) {
    console.warn('[WHOOP] Callback missing code');
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'no_code' }));
  }

  if (!decodedState.userId) {
    console.error('[WHOOP] Callback missing userId in state', {
      hasState: Boolean(state),
      hasSecret: Boolean(resolvedEnv.BETTER_AUTH_SECRET),
    });
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'invalid_state' }));
  }

  const userId = decodedState.userId;
  const db = getDb(c);
  const baseURL = resolveWhoopRedirectBaseURL(resolvedEnv, c.req.url);
  if (!baseURL) {
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'missing_base_url' }));
  }
  const redirectUri = `${baseURL}/api/auth/whoop/callback`;

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(resolvedEnv, code, redirectUri);

    // Get WHOOP profile to get their user ID
    const whoopProfile = await getWhoopProfile(tokens.access_token);

    // Store tokens
    await storeWhoopTokens(
      db,
      resolvedEnv,
      userId,
      String(whoopProfile.user_id),
      tokens.access_token,
      tokens.refresh_token,
      new Date(tokens.expires_at!),
      tokens.scope,
    );

    await upsertWhoopProfile(db, userId, whoopProfile);

    console.info('[WHOOP] Callback completed successfully', {
      hasUserId: Boolean(userId),
      hasWhoopUserId: Boolean(whoopProfile.user_id),
    });
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { success: 'true' }));
  } catch (e) {
    console.error('[WHOOP] Callback error:', e);
    return c.redirect(
      buildWhoopCallbackRedirect(deepLink, {
        error: e instanceof Error ? e.message : 'unknown',
      }),
    );
  }
});

const WHOOP_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

async function signWhoopState(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

async function encodeWhoopOAuthState(
  secret: string,
  payload: { nonce: string; returnTo?: string; userId: string },
) {
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      ...payload,
      expiresAt: Date.now() + WHOOP_OAUTH_STATE_TTL_MS,
    }),
  );
  const signature = await signWhoopState(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function decodeWhoopOAuthState(
  secret: string | undefined,
  state: string | undefined,
): Promise<{
  nonce?: string;
  returnTo?: string;
  userId?: string;
}> {
  if (!state || !secret) {
    return {};
  }

  const [encodedPayload, signature, extra] = state.split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return {};
  }

  const expectedSignature = await signWhoopState(secret, encodedPayload);
  if (signature !== expectedSignature) {
    return {};
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as {
      expiresAt?: number;
      nonce?: string;
      returnTo?: string;
      userId?: string;
    };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
      return {};
    }

    return {
      ...(typeof parsed.nonce === 'string' ? { nonce: parsed.nonce } : {}),
      ...(typeof parsed.returnTo === 'string' && isAllowedWhoopReturnTo(parsed.returnTo)
        ? { returnTo: parsed.returnTo }
        : {}),
      ...(typeof parsed.userId === 'string' ? { userId: parsed.userId } : {}),
    };
  } catch {
    return {};
  }
}

function buildWhoopCallbackRedirect(deepLink: string, params: Record<string, string>) {
  const separator = deepLink.includes('?') ? '&' : '?';
  const query = new URLSearchParams(params).toString();
  return `${deepLink}${separator}${query}`;
}

function getURLOrigin(value: string | undefined) {
  try {
    return value ? new URL(value).origin : undefined;
  } catch {
    return undefined;
  }
}

function isLoopbackOrigin(value: string | undefined) {
  const origin = getURLOrigin(value);
  if (!origin) {
    return false;
  }

  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function resolveWhoopRedirectBaseURL(env: WorkerEnv, requestUrl?: string) {
  const configuredBaseURL = resolveBaseURL(env);
  const requestBaseURL = getURLOrigin(requestUrl);

  if (
    env.APP_ENV === 'development' &&
    isLoopbackOrigin(configuredBaseURL) &&
    requestBaseURL &&
    !isLoopbackOrigin(requestBaseURL)
  ) {
    return requestBaseURL;
  }

  return configuredBaseURL;
}

function isAllowedWhoopRedirectBaseURL(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

function isAllowedWhoopReturnTo(value: string) {
  try {
    const url = new URL(value);
    return ['strength:', 'exp:', 'exps:', 'http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

// POST /api/whoop/sync-all - Sync all WHOOP data
app.post(
  '/api/whoop/sync-all',
  createHandler(async (c, { userId, db }) => {
    const connected = await isWhoopConnected(db, userId);
    if (!connected) {
      const integrationExists = await whoopIntegrationExists(db, userId);
      if (!integrationExists) {
        return c.json(
          {
            error: 'WHOOP_NOT_CONNECTED',
            message: 'WHOOP not connected. Please connect your account.',
            reauthUrl: null,
          },
          401,
        );
      }
      return c.json(
        {
          error: 'WHOOP_SESSION_EXPIRED',
          message: 'WHOOP session has expired. Please reconnect your account.',
          reauthUrl: null,
        },
        401,
      );
    }

    try {
      const result = await syncAllWhoopData(db, c.env, userId);
      const authError = result.errors.find(
        (message) =>
          message.includes('WHOOP_SESSION_EXPIRED') ||
          message.includes('WHOOP_REAUTH_REQUIRED') ||
          message.includes('Please reconnect WHOOP') ||
          message.includes('Please re-authorize'),
      );
      if (authError) {
        return c.json(
          {
            error: 'WHOOP_REAUTH_REQUIRED',
            message: authError,
          },
          401,
        );
      }

      return c.json({
        success: result.errors.length === 0,
        ...result,
      });
    } catch (e) {
      console.error('[WHOOP] Sync error:', e);
      return c.json(
        { message: 'Sync failed', error: e instanceof Error ? e.message : 'Unknown' },
        500,
      );
    }
  }),
);

// GET /api/whoop/status - Check WHOOP connection status
app.get(
  '/api/whoop/status',
  createHandler(async (c, { userId, db }) => {
    const connected = await isWhoopConnected(db, userId);
    if (!connected) {
      return c.json({ connected: false });
    }

    try {
      await getValidWhoopToken(db, c.env, userId);

      const whoopUserId = await getWhoopUserId(db, userId);
      const profile = await getWhoopProfileByUserId(db, userId);

      return c.json({
        connected: true,
        whoopUserId,
        profile: profile
          ? {
              email: profile.email,
              firstName: profile.firstName,
              lastName: profile.lastName,
            }
          : null,
      });
    } catch (e) {
      if (isWhoopAuthError(e)) {
        return c.json({
          connected: false,
          ...toWhoopAuthErrorResponse(e),
        });
      }

      console.error('[WHOOP] Status error:', e);
      return c.json({ message: 'Failed to check WHOOP status' }, 500);
    }
  }),
);

// GET /api/whoop/data - Get WHOOP data (recovery, sleep, cycles, workouts)
app.get(
  '/api/whoop/data',
  createHandler(async (c, { userId, db }) => {
    const connected = await isWhoopConnected(db, userId);
    if (!connected) {
      const integrationExists = await whoopIntegrationExists(db, userId);
      if (!integrationExists) {
        return c.json(
          {
            error: 'WHOOP_NOT_CONNECTED',
            message: 'WHOOP not connected. Please connect your account.',
            reauthUrl: null,
          },
          401,
        );
      }
      return c.json(
        {
          error: 'WHOOP_SESSION_EXPIRED',
          message: 'WHOOP session has expired. Please reconnect your account.',
          reauthUrl: null,
        },
        401,
      );
    }

    const days = parseInt(c.req.query('days') ?? '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      await getValidWhoopToken(db, c.env, userId);

      const [recovery, sleep, cycles, workouts] = await Promise.all([
        db
          .select()
          .from(whoopRecovery)
          .where(eq(whoopRecovery.userId, userId))
          .orderBy(desc(whoopRecovery.date)),
        db
          .select()
          .from(whoopSleep)
          .where(and(eq(whoopSleep.userId, userId), gt(whoopSleep.start, since)))
          .orderBy(desc(whoopSleep.start)),
        db
          .select()
          .from(whoopCycle)
          .where(and(eq(whoopCycle.userId, userId), gt(whoopCycle.start, since)))
          .orderBy(desc(whoopCycle.start)),
        db
          .select()
          .from(whoopWorkout)
          .where(and(eq(whoopWorkout.userId, userId), gt(whoopWorkout.start, since)))
          .orderBy(desc(whoopWorkout.start)),
      ]);

      const normalizedRecovery = recovery.map((row) => {
        const rawData = parseJsonObject(row.rawData);
        const score = getObject(rawData, 'score');
        const storedDate =
          row.date instanceof Date && !Number.isNaN(row.date.getTime()) ? row.date.getTime() : null;
        const fallbackDate =
          getTimestamp(rawData, 'created_at') ??
          getTimestamp(rawData, 'updated_at') ??
          (row.createdAt instanceof Date ? row.createdAt.getTime() : null);

        return withWhoopFallbacks(row, {
          date: new Date(storedDate ?? fallbackDate ?? Date.now()),
          recoveryScore: row.recoveryScore ?? getNumber(score, 'recovery_score'),
          hrvRmssdMilli: row.hrvRmssdMilli ?? getNumber(score, 'hrv_rmssd_milli'),
          restingHeartRate: row.restingHeartRate ?? getNumber(score, 'resting_heart_rate'),
        });
      });

      const filteredRecovery = normalizedRecovery.filter(
        (row) => row.date instanceof Date && row.date.getTime() > since.getTime(),
      );

      const normalizedSleep = sleep.map((row) => {
        const rawData = parseJsonObject(row.rawData);
        const score = getObject(rawData, 'score');
        const stageSummary = getObject(score, 'stage_summary');
        const sleepNeeded = getObject(score, 'sleep_needed');
        const lightSleep =
          row.lightSleepTimeMilli ?? getNumber(stageSummary, 'total_light_sleep_time_milli');
        const slowWaveSleep =
          row.slowWaveSleepTimeMilli ?? getNumber(stageSummary, 'total_slow_wave_sleep_time_milli');
        const remSleep =
          row.remSleepTimeMilli ?? getNumber(stageSummary, 'total_rem_sleep_time_milli');
        const fallbackTotalSleepTime = [lightSleep, slowWaveSleep, remSleep].reduce<number>(
          (sum, value) => sum + (value ?? 0),
          0,
        );
        const totalSleepTime = row.totalSleepTimeMilli ?? fallbackTotalSleepTime;

        return withWhoopFallbacks(row, {
          sleepPerformancePercentage:
            row.sleepPerformancePercentage ?? getNumber(score, 'sleep_performance_percentage'),
          totalSleepTimeMilli: totalSleepTime > 0 ? totalSleepTime : null,
          sleepEfficiencyPercentage:
            row.sleepEfficiencyPercentage ?? getNumber(score, 'sleep_efficiency_percentage'),
          slowWaveSleepTimeMilli: slowWaveSleep,
          remSleepTimeMilli: remSleep,
          lightSleepTimeMilli: lightSleep,
          wakeTimeMilli: row.wakeTimeMilli ?? getNumber(stageSummary, 'total_awake_time_milli'),
          disturbanceCount: row.disturbanceCount ?? getNumber(stageSummary, 'disturbance_count'),
          sleepConsistencyPercentage:
            row.sleepConsistencyPercentage ?? getNumber(score, 'sleep_consistency_percentage'),
          sleepNeedBaselineMilli:
            row.sleepNeedBaselineMilli ?? getNumber(sleepNeeded, 'baseline_milli'),
          sleepNeedFromSleepDebtMilli:
            row.sleepNeedFromSleepDebtMilli ?? getNumber(sleepNeeded, 'need_from_sleep_debt_milli'),
          sleepNeedFromRecentStrainMilli:
            row.sleepNeedFromRecentStrainMilli ??
            getNumber(sleepNeeded, 'need_from_recent_strain_milli'),
          sleepNeedFromRecentNapMilli:
            row.sleepNeedFromRecentNapMilli ?? getNumber(sleepNeeded, 'need_from_recent_nap_milli'),
          respiratoryRate: getNumber(score, 'respiratory_rate'),
        });
      });

      const normalizedCycles = cycles.map((row) => {
        const rawData = parseJsonObject(row.rawData);
        const score = getObject(rawData, 'score');

        return withWhoopFallbacks(row, {
          dayStrain: row.dayStrain ?? getNumber(score, 'strain'),
          averageHeartRate: row.averageHeartRate ?? getNumber(score, 'average_heart_rate'),
          maxHeartRate: row.maxHeartRate ?? getNumber(score, 'max_heart_rate'),
          kilojoule: row.kilojoule ?? getNumber(score, 'kilojoule'),
        });
      });

      const uniqueCyclesById = normalizedCycles.filter(
        (c, i, arr) => arr.findIndex((x) => x.whoopCycleId === c.whoopCycleId) === i,
      );

      const normalizedWorkouts = workouts.map((row) => {
        const score = parseJsonObject(row.score);
        const kilojoule = getNumber(score, 'kilojoule');

        return withWhoopFallbacks(row, {
          strain: getNumber(score, 'strain'),
          averageHeartRate: getNumber(score, 'average_heart_rate'),
          maxHeartRate: getNumber(score, 'max_heart_rate'),
          kilojoule,
          caloriesKcal: kilojoule != null ? Math.round(kilojoule / 4.184) : null,
        } as Partial<typeof row> & {
          strain: number | null;
          averageHeartRate: number | null;
          maxHeartRate: number | null;
          kilojoule: number | null;
          caloriesKcal: number | null;
        });
      });

      return c.json({
        recovery: filteredRecovery,
        sleep: normalizedSleep,
        cycles: uniqueCyclesById,
        workouts: normalizedWorkouts,
      });
    } catch (e) {
      if (isWhoopAuthError(e)) {
        return c.json(toWhoopAuthErrorResponse(e), 401);
      }

      console.error('[WHOOP] Data fetch error:', e);
      return c.json({ message: 'Failed to fetch WHOOP data' }, 500);
    }
  }),
);

// POST /api/whoop/disconnect - Disconnect WHOOP
app.post(
  '/api/whoop/disconnect',
  createHandler(async (c, { userId, db }) => {
    try {
      await revokeWhoopIntegration(db, userId);
      return c.json({ success: true });
    } catch (e) {
      console.error('[WHOOP] Disconnect error:', e);
      return c.json({ message: 'Disconnect failed' }, 500);
    }
  }),
);

// POST /api/webhooks/whoop - WHOOP webhook receiver
app.post('/api/webhooks/whoop', async (c) => {
  const timestamp = c.req.raw.headers.get('X-WHOOP-Signature-Timestamp') ?? '';
  const signature = c.req.raw.headers.get('X-WHOOP-Signature') ?? '';
  const rawBody = await c.req.raw.text();

  const isValid = await verifyWebhookSignature(c.env, timestamp, signature, rawBody);
  if (!isValid) {
    console.error('[WHOOP Webhook] Invalid signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    const event = normalizeWhoopWebhookPayload(parsedBody);
    if (!event) {
      return c.json({ error: 'Invalid WHOOP webhook payload' }, 400);
    }

    const db = getDb(c);
    const result = await handleWebhookEvent(db, c.env, event);

    if (result.success && result.ignored) {
      return c.json({ success: true, ignored: true }, 202);
    } else {
      if (result.success) {
        return c.json({ success: true });
      }

      return c.json({ error: result.error }, 500);
    }
  } catch (e) {
    console.error('[WHOOP Webhook] Error:', e);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

// GET /api/webhooks/whoop - WHOOP webhook verification (GET for URL verification)
app.get('/api/webhooks/whoop', async (c) => {
  return c.json({ ok: true, message: 'WHOOP webhook endpoint active' });
});

// Nutrition API Routes
import { chatHandler, getChatHistoryHandler } from './api/nutrition/chat';
import { dailySummaryHandler } from './api/nutrition/daily-summary';
import { getEntriesHandler, createEntryHandler } from './api/nutrition/entries';
import {
  getEntryHandler,
  updateEntryHandler,
  deleteEntryHandler,
} from './api/nutrition/entries.$id';
import { getBodyStatsHandler, upsertBodyStatsHandler } from './api/nutrition/body-stats';
import { upsertTrainingContextHandler } from './api/nutrition/training-context';

app.post('/api/nutrition/chat', chatHandler);
app.get('/api/nutrition/chat/history', getChatHistoryHandler);

app.get('/api/nutrition/daily-summary', dailySummaryHandler);

app.get('/api/nutrition/entries', getEntriesHandler);
app.post('/api/nutrition/entries', createEntryHandler);

app.get('/api/nutrition/entries/:id', getEntryHandler);
app.put('/api/nutrition/entries/:id', updateEntryHandler);
app.delete('/api/nutrition/entries/:id', deleteEntryHandler);

app.get('/api/nutrition/body-stats', getBodyStatsHandler);
app.post('/api/nutrition/body-stats', upsertBodyStatsHandler);

app.post('/api/nutrition/training-context', upsertTrainingContextHandler);

// Home API Routes
import { homeSummaryHandler } from './api/home/summary';

app.get('/api/home/summary', homeSummaryHandler);

export default app;
