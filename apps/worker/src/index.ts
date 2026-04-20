/* oxlint-disable no-unused-vars */
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { createAuth, isDevAuthEnabled, type WorkerEnv } from './auth';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, like, desc, sql, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import { exerciseLibrary, chunkedQuery, chunkedInsert } from '@strength/db';
import {
  createProgramCycle,
  getOrCreateExerciseForUser,
  getProgramCycleWithWorkouts,
  getProgramCycleById,
} from '@strength/db';
import { getProgram, generateWorkoutSchedule } from './programs';

type Variables = {
  user: ReturnType<typeof createAuth>['$Infer']['Session']['user'] | null;
  session: ReturnType<typeof createAuth>['$Infer']['Session']['session'] | null;
};

const app = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

function isAllowedDevOrigin(origin: string) {
  if (!origin) return true;
  const allowed =
    origin.startsWith('strength://') ||
    /^exp:\/\/.+/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^http:\/\/(?:10|192\.168|172\.(?:1[6-9]|2\d|3[0-1]))(?:\.\d{1,3}){2}(?::\d+)?$/i.test(origin);
  console.log('CORS origin check:', origin?.slice(0, 50), 'allowed:', allowed);
  return allowed;
}

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (isAllowedDevOrigin(origin)) return origin;
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
  if (!isDevAuthEnabled(c.env)) {
    c.set('user', null);
    c.set('session', null);
    await next();
    return;
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set('user', session?.user ?? null);
  c.set('session', session?.session ?? null);

  await next();
});

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    authMode: isDevAuthEnabled(c.env) ? 'development' : 'disabled',
  });
});

app.get('/api/me', (c) => {
  const user = c.get('user');
  const session = c.get('session');

  if (!user || !session) {
    return c.json({ message: 'Unauthorized' }, 401);
  }

  return c.json({ user, session });
});

app.get('/api/profile/preferences', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      prefs = result;
    }

    return c.json({ weightUnit: prefs.weightUnit });
  } catch (e) {
    console.log('DEBUG getPreferences error:', e);
    return c.json({ message: 'Failed to fetch preferences' }, 500);
  }
});

app.put('/api/profile/preferences', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  try {
    const body = await c.req.json();
    const { weightUnit } = body;

    if (!weightUnit || !['kg', 'lbs'].includes(weightUnit)) {
      return c.json({ message: 'Invalid weight unit' }, 400);
    }

    const existing = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .get();

    let result;
    if (existing) {
      result = await db
        .update(schema.userPreferences)
        .set({ weightUnit, updatedAt: new Date() })
        .where(eq(schema.userPreferences.userId, userId))
        .returning()
        .get();
    } else {
      const now = new Date();
      result = await db
        .insert(schema.userPreferences)
        .values({
          userId,
          weightUnit,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    }

    return c.json({ weightUnit: result.weightUnit });
  } catch (e) {
    console.log('DEBUG updatePreferences error:', e);
    return c.json({ message: 'Failed to update preferences' }, 500);
  }
});

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  if (!isDevAuthEnabled(c.env)) {
    return c.json(
      { message: 'Authentication is intentionally disabled outside development right now.' },
      403,
    );
  }

  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

async function requireAuth(c: any) {
  if (!isDevAuthEnabled(c.env)) {
    return { user: null, session: null };
  }
  const auth = createAuth(c.env);
  const cookieHeader = c.req.raw.headers.get('cookie');
  const authHeader = c.req.raw.headers.get('authorization');
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session;
}

function getDb(c: any) {
  return drizzle(c.env.DB, { schema });
}

async function getLastCompletedExerciseSnapshot(db: any, userId: string, exerciseId: string) {
  let resolvedExerciseId = exerciseId;

  const existingUserExercise = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.userId, userId)))
    .get();

  if (!existingUserExercise) {
    const byLibraryId = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(and(eq(schema.exercises.libraryId, exerciseId), eq(schema.exercises.userId, userId)))
      .get();

    if (byLibraryId) {
      resolvedExerciseId = byLibraryId.id;
    }
  } else {
    resolvedExerciseId = existingUserExercise.id;
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
    sets: allSets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
      setNumber: s.setNumber,
    })),
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

function parseProgramTargetLifts(targetLifts: string | null | undefined) {
  if (!targetLifts) {
    return [];
  }

  try {
    const parsed = JSON.parse(targetLifts);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function createWorkoutFromProgramCycleWorkout(
  db: any,
  userId: string,
  cycleId: string,
  cycleWorkout: any,
) {
  const now = new Date();
  const workout = await db
    .insert(schema.workouts)
    .values({
      userId,
      name: cycleWorkout.sessionName,
      notes: null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  const targetLifts = parseProgramTargetLifts(cycleWorkout.targetLifts);

  for (let i = 0; i < targetLifts.length; i++) {
    const targetLift = targetLifts[i];
    const exerciseId = await getOrCreateExerciseForUser(
      db,
      userId,
      targetLift.name,
      targetLift.lift,
    );

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

    const historySnapshot = await getLastCompletedExerciseSnapshot(db, userId, exerciseId);
    const fallbackSetCount = normalizeProgramSetCount(targetLift.sets, 1);
    const fallbackWeight =
      typeof targetLift.targetWeight === 'number' && Number.isFinite(targetLift.targetWeight)
        ? targetLift.targetWeight
        : null;
    const fallbackReps = normalizeProgramReps(targetLift.reps);

    const setRows =
      historySnapshot && historySnapshot.sets.length > 0
        ? historySnapshot.sets.map((set, index) => ({
            workoutExerciseId: workoutExercise.id,
            setNumber: index + 1,
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
            isComplete: false,
            createdAt: now,
            updatedAt: now,
          }))
        : Array.from({ length: fallbackSetCount }, (_, index) => ({
            workoutExerciseId: workoutExercise.id,
            setNumber: index + 1,
            weight: fallbackWeight,
            reps: fallbackReps,
            rpe: null,
            isComplete: false,
            createdAt: now,
            updatedAt: now,
          }));

    await chunkedInsert(db, { table: schema.workoutSets, rows: setRows });
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

  const cycleWorkouts = await db
    .select({
      id: schema.programCycleWorkouts.id,
      weekNumber: schema.programCycleWorkouts.weekNumber,
      sessionNumber: schema.programCycleWorkouts.sessionNumber,
    })
    .from(schema.programCycleWorkouts)
    .where(eq(schema.programCycleWorkouts.cycleId, linkedCycleWorkout.cycleId))
    .orderBy(schema.programCycleWorkouts.weekNumber, schema.programCycleWorkouts.sessionNumber)
    .all();

  const currentIndex = cycleWorkouts.findIndex((cw) => cw.id === linkedCycleWorkout.id);
  const nextCycleWorkout = currentIndex >= 0 ? cycleWorkouts[currentIndex + 1] : null;
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

app.get('/api/exercises', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const search = c.req.query('search');
  try {
    const conditions = [eq(schema.exercises.userId, userId), eq(schema.exercises.isDeleted, false)];
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
});

app.post('/api/exercises', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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
});

app.get('/api/exercises/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
});

app.put('/api/exercises/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
});

app.delete('/api/exercises/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
});

app.get('/api/templates', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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
    const templateExercises = await chunkedQuery(db, {
      ids: templateIds,
      mergeKey: 'id',
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
          .innerJoin(schema.exercises, eq(schema.templateExercises.exerciseId, schema.exercises.id))
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
});

app.post('/api/templates', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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
});

app.get('/api/templates/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const template = await db
      .select()
      .from(schema.templates)
      .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
      .get();
    if (!template) {
      return c.json({ message: 'Template not found' }, 404);
    }
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
});

app.put('/api/templates/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
});

app.delete('/api/templates/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
});

app.get('/api/templates/:id/exercises', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const template = await db
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

    if (!template) {
      return c.json({ message: 'Template not found' }, 404);
    }

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
      })
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, id))
      .orderBy(schema.templateExercises.orderIndex)
      .all();

    return c.json(exercises);
  } catch (_e) {
    return c.json({ message: 'Failed to fetch template exercises' }, 500);
  }
});

app.post('/api/templates/:id/exercises', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const template = await db
      .select()
      .from(schema.templates)
      .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
      .get();
    if (!template) {
      return c.json({ message: 'Template not found' }, 404);
    }
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
});

app.delete('/api/templates/:id/exercises/:exerciseId', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const { id, exerciseId } = c.req.param();
  try {
    const template = await db
      .select()
      .from(schema.templates)
      .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
      .get();
    if (!template) {
      return c.json({ message: 'Template not found' }, 404);
    }
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
});

app.post('/api/templates/:id/copy', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const original = await db
      .select()
      .from(schema.templates)
      .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
      .get();
    if (!original) {
      return c.json({ message: 'Template not found' }, 404);
    }
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
          sets: te.sets,
          reps: te.reps,
          isAmrap: te.isAmrap,
          setNumber: te.setNumber,
        })),
      });
    }
    return c.json(newTemplate, 201);
  } catch (_e) {
    return c.json({ message: 'Failed to copy template' }, 500);
  }
});

app.get('/api/workouts', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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

    const exerciseCountMap = new Map(exerciseCounts.map((ec) => [ec.workoutId, ec.exerciseCount]));

    return c.json(
      results.map((w) => ({
        ...w,
        exerciseCount: exerciseCountMap.get(w.id) ?? 0,
      })),
    );
  } catch (_e) {
    return c.json({ message: 'Failed to fetch workouts' }, 500);
  }
});

app.post('/api/workouts', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  try {
    const body = await c.req.json();
    const { name, templateId, notes } = body;
    if (!name) {
      return c.json({ message: 'Name is required' }, 400);
    }
    const now = new Date();
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
            ? historySnapshot.sets.map((set, index) => ({
                workoutExerciseId: workoutExercise.id,
                setNumber: index + 1,
                weight: set.weight,
                reps: set.reps,
                rpe: set.rpe,
                isComplete: false,
                createdAt: now,
                updatedAt: now,
              }))
            : Array.from({ length: templateExercise.sets ?? 3 }, (_, s) => ({
                workoutExerciseId: workoutExercise.id,
                setNumber: s + 1,
                weight: (templateExercise.targetWeight ?? 0) + (templateExercise.addedWeight ?? 0),
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
});

app.get('/api/workouts/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const workout = await db
      .select()
      .from(schema.workouts)
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .get();
    if (!workout) {
      return c.json({ message: 'Workout not found' }, 404);
    }
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
        exercise: {
          id: schema.exercises.id,
          name: schema.exercises.name,
          muscleGroup: schema.exercises.muscleGroup,
        },
      })
      .from(schema.workoutExercises)
      .innerJoin(schema.exercises, eq(schema.workoutExercises.exerciseId, schema.exercises.id))
      .where(eq(schema.workoutExercises.workoutId, id))
      .orderBy(schema.workoutExercises.orderIndex)
      .all();
    const exercisesWithSets = [];
    for (const we of exercisesResult) {
      const sets = await db
        .select({
          id: schema.workoutSets.id,
          setNumber: schema.workoutSets.setNumber,
          weight: schema.workoutSets.weight,
          reps: schema.workoutSets.reps,
          rpe: schema.workoutSets.rpe,
          isComplete: schema.workoutSets.isComplete,
          completedAt: schema.workoutSets.completedAt,
          createdAt: schema.workoutSets.createdAt,
        })
        .from(schema.workoutSets)
        .where(eq(schema.workoutSets.workoutExerciseId, we.id))
        .orderBy(schema.workoutSets.setNumber)
        .all();
      exercisesWithSets.push({ ...we, sets });
    }
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
});

app.put('/api/workouts/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
});

app.delete('/api/workouts/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
});

app.put('/api/workouts/:id/complete', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
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
    const durationMinutes = workout.startedAt
      ? Math.round((now.getTime() - new Date(workout.startedAt).getTime()) / 60000)
      : 0;
    const result = await db
      .update(schema.workouts)
      .set({
        completedAt: now,
        completedDate: now.toISOString().split('T')[0],
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
});

app.post('/api/workouts/:id/exercises', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const workout = await db
      .select()
      .from(schema.workouts)
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .get();
    if (!workout) {
      return c.json({ message: 'Workout not found' }, 404);
    }
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
});

app.delete('/api/workouts/:id/exercises/:exerciseId', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const { id, exerciseId } = c.req.param();
  try {
    const workout = await db
      .select()
      .from(schema.workouts)
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .get();
    if (!workout) {
      return c.json({ message: 'Workout not found' }, 404);
    }
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
});

app.post('/api/workouts/sets', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  try {
    const body = await c.req.json();
    const { workoutExerciseId, setNumber, weight, reps, rpe, isComplete } = body;
    if (!workoutExerciseId || setNumber === undefined) {
      return c.json({ message: 'workoutExerciseId and setNumber are required' }, 400);
    }
    const we = await db
      .select()
      .from(schema.workoutExercises)
      .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
      .where(
        and(eq(schema.workoutExercises.id, workoutExerciseId), eq(schema.workouts.userId, userId)),
      )
      .get();
    if (!we) {
      return c.json({ message: 'Workout exercise not found' }, 404);
    }
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
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json(result, 201);
  } catch (_e) {
    return c.json({ message: 'Failed to create set' }, 500);
  }
});

app.put('/api/workouts/sets/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const set = await db
      .select()
      .from(schema.workoutSets)
      .innerJoin(
        schema.workoutExercises,
        eq(schema.workoutSets.workoutExerciseId, schema.workoutExercises.id),
      )
      .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
      .where(and(eq(schema.workoutSets.id, id), eq(schema.workouts.userId, userId)))
      .get();
    if (!set) {
      return c.json({ message: 'Set not found' }, 404);
    }
    const body = await c.req.json();
    const updateData: any = { ...body, updatedAt: new Date() };
    if (body.isComplete === true) {
      updateData.completedAt = new Date();
    }
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
});

app.delete('/api/workouts/sets/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const id = c.req.param('id');
  try {
    const set = await db
      .select()
      .from(schema.workoutSets)
      .innerJoin(
        schema.workoutExercises,
        eq(schema.workoutSets.workoutExerciseId, schema.workoutExercises.id),
      )
      .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
      .where(and(eq(schema.workoutSets.id, id), eq(schema.workouts.userId, userId)))
      .get();
    if (!set) {
      return c.json({ message: 'Set not found' }, 404);
    }
    const result = await db.delete(schema.workoutSets).where(eq(schema.workoutSets.id, id)).run();
    return c.json({ success: result.success });
  } catch (_e) {
    return c.json({ message: 'Failed to delete set' }, 500);
  }
});

app.get('/api/workouts/last/:exerciseId', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const exerciseId = c.req.param('exerciseId');
  try {
    const snapshot = await getLastCompletedExerciseSnapshot(db, userId, exerciseId);

    if (!snapshot) {
      return c.json(null);
    }

    return c.json({
      exerciseId: snapshot.exerciseId,
      workoutDate: snapshot.workoutDate,
      sets: snapshot.sets.map((set) => ({
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
      })),
    });
  } catch (_e) {
    return c.json({ message: 'Failed to fetch last workout data' }, 500);
  }
});

app.get('/api/programs', async (c) => {
  const { PROGRAMS } = await import('./programs');
  const programsList = Object.values(PROGRAMS).map((p) => ({
    slug: p.info.slug,
    name: p.info.name,
    description: p.info.description,
    difficulty: p.info.difficulty,
    daysPerWeek: p.info.daysPerWeek,
    estimatedWeeks: p.info.estimatedWeeks,
    mainLifts: p.info.mainLifts,
  }));
  return c.json(programsList);
});

app.post('/api/programs', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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

    const startDate = programStartDate ? new Date(programStartDate) : new Date();
    const firstDate = firstSessionDate ? new Date(firstSessionDate) : undefined;

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

    const workouts = generatedWorkouts.map((workout, index) => {
      const scheduleEntry = schedule[index];
      const allExercises = [
        ...workout.exercises.map((e) => ({
          name: e.name,
          lift: e.lift,
          targetWeight: e.targetWeight,
          sets: e.sets,
          reps: e.reps,
          isAccessory: false,
        })),
        ...(workout.accessories || []).map((a) => ({
          name: a.name,
          accessoryId: a.accessoryId,
          targetWeight: a.targetWeight,
          sets: a.sets,
          reps: a.reps,
          isAccessory: true,
        })),
      ];
      return {
        weekNumber: workout.weekNumber,
        sessionNumber: workout.sessionNumber,
        sessionName: workout.sessionName,
        scheduledDate: scheduleEntry?.scheduledDate?.toISOString().split('T')[0] || null,
        scheduledTime: scheduleEntry?.scheduledTime || null,
        targetLifts: JSON.stringify(allExercises),
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
      programStartDate,
      firstSessionDate,
      workouts,
    });

    return c.json(cycle, 201);
  } catch (_e) {
    console.error('Failed to start program:', _e);
    return c.json({ message: 'Failed to start program' }, 500);
  }
});

app.get('/api/programs/active', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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
      .get();
    return c.json(result);
  } catch (_e) {
    return c.json({ message: 'Failed to fetch active program' }, 500);
  }
});

app.put('/api/programs/active', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
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
});

app.get('/api/programs/cycles/:id', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const cycleId = c.req.param('id');
  try {
    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }
    return c.json(result);
  } catch (_e) {
    return c.json({ message: 'Failed to fetch program cycle' }, 500);
  }
});

app.get('/api/programs/cycles/:id/workouts', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const cycleId = c.req.param('id');
  try {
    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }
    return c.json(result.workouts);
  } catch (_e) {
    return c.json({ message: 'Failed to fetch workouts' }, 500);
  }
});

app.get('/api/programs/cycles/:id/workouts/current', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const cycleId = c.req.param('id');
  try {
    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }
    const { currentWeek, currentSession } = result.cycle;
    const currentWorkout = result.workouts.find(
      (w) => w.weekNumber === currentWeek && w.sessionNumber === currentSession,
    );
    if (!currentWorkout) {
      return c.json({ message: 'Current workout not found' }, 404);
    }
    return c.json(currentWorkout);
  } catch (_e) {
    return c.json({ message: 'Failed to fetch current workout' }, 500);
  }
});

app.post('/api/programs/cycles/:id/workouts/current/start', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const cycleId = c.req.param('id');
  try {
    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }

    const { currentWeek, currentSession } = result.cycle;
    const currentCycleWorkout = result.workouts.find(
      (w) => w.weekNumber === currentWeek && w.sessionNumber === currentSession,
    );

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
      created: true,
      completed: false,
    });
  } catch (_e) {
    return c.json({ message: 'Failed to start current workout' }, 500);
  }
});

app.post('/api/programs/cycles/:id/complete-session', async (c) => {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);
  const cycleId = c.req.param('id');
  try {
    const cycleData = await getProgramCycleById(db, cycleId, userId);
    if (!cycleData) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }

    const { currentWeek, currentSession, totalSessionsCompleted, status } = cycleData;
    const newSessionsCompleted = totalSessionsCompleted + 1;

    const daysPerWeek = 3;
    let newSession = currentSession + 1;
    let newWeek = currentWeek;

    if (newSession > daysPerWeek) {
      newSession = 1;
      newWeek = currentWeek + 1;
    }

    const result = await db
      .update(schema.userProgramCycles)
      .set({
        currentWeek: newWeek,
        currentSession: newSession,
        totalSessionsCompleted: newSessionsCompleted,
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.userProgramCycles.id, cycleId), eq(schema.userProgramCycles.userId, userId)),
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
});

export default app;
