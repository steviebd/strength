/* oxlint-disable no-unused-vars */
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { createAuth, isDevAuthEnabled, type WorkerEnv } from './auth';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, like, desc, sql, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import { exerciseLibrary, chunkedQuery, chunkedInsert } from '@strength/db';

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

  const requiresSession = c.req.path.startsWith('/api/auth/') || c.req.path === '/api/me';

  if (!requiresSession) {
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
  const auth = createAuth(c.env);
  const cookieHeader = c.req.raw.headers.get('cookie');
  console.log('DEBUG requireAuth - cookie:', cookieHeader?.slice(0, 200) ?? 'none');
  const authHeader = c.req.raw.headers.get('authorization');
  console.log('DEBUG requireAuth - auth header:', authHeader ?? 'none');
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  console.log('DEBUG requireAuth - session:', JSON.stringify(session));
  return session;
}

function getDb(c: any) {
  return drizzle(c.env.DB, { schema });
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
    if (!name) {
      return c.json({ message: 'Name is required' }, 400);
    }
    const now = new Date();
    const result = await db
      .insert(schema.exercises)
      .values({
        userId,
        name,
        muscleGroup: muscleGroup || null,
        description: description || null,
        libraryId: libraryId || null,
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
        const sets = templateExercise.sets ?? 3;
        const weight = (templateExercise.targetWeight ?? 0) + (templateExercise.addedWeight ?? 0);
        const setRows = Array.from({ length: sets }, (_, s) => ({
          workoutExerciseId: workoutExercise.id,
          setNumber: s + 1,
          weight: weight,
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
    const result = await db
      .update(schema.workouts)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
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
    let resolvedExerciseId = exerciseId;
    const existingExercise = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.userId, userId)))
      .get();

    if (!existingExercise) {
      const existingLibraryExercise = await db
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(and(eq(schema.exercises.userId, userId), eq(schema.exercises.libraryId, exerciseId)))
        .get();

      if (existingLibraryExercise) {
        resolvedExerciseId = existingLibraryExercise.id;
      } else {
        const libraryExercise = exerciseLibrary.find((exercise) => exercise.id === exerciseId);

        if (libraryExercise) {
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
    }
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
    const recentSet = await db
      .select({
        weight: schema.workoutSets.weight,
        reps: schema.workoutSets.reps,
        rpe: schema.workoutSets.rpe,
        completedAt: schema.workoutSets.completedAt,
      })
      .from(schema.workoutSets)
      .innerJoin(
        schema.workoutExercises,
        eq(schema.workoutSets.workoutExerciseId, schema.workoutExercises.id),
      )
      .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
      .where(
        and(eq(schema.workoutExercises.exerciseId, exerciseId), eq(schema.workouts.userId, userId)),
      )
      .orderBy(desc(schema.workouts.completedAt))
      .limit(1)
      .get();
    if (!recentSet) {
      return c.json(null);
    }
    return c.json({
      exerciseId,
      weight: recentSet.weight,
      reps: recentSet.reps,
      rpe: recentSet.rpe,
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
      totalSessionsPlanned,
      estimatedWeeks,
    } = body;
    if (!programSlug || !name || !totalSessionsPlanned) {
      return c.json({ message: 'programSlug, name, and totalSessionsPlanned are required' }, 400);
    }
    const result = await db
      .insert(schema.userProgramCycles)
      .values({
        userId,
        programSlug,
        name,
        squat1rm: squat1rm || 0,
        bench1rm: bench1rm || 0,
        deadlift1rm: deadlift1rm || 0,
        ohp1rm: ohp1rm || 0,
        totalSessionsPlanned,
        estimatedWeeks,
        status: 'active',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .get();
    return c.json(result, 201);
  } catch (_e) {
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

export default app;
