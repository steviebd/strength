import { eq, and, like, desc } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { resolveToUserExerciseId, findExistingUserExerciseByName } from '../lib/program-helpers';

export function buildExerciseUpdate(body: Record<string, unknown>) {
  const allowed: Record<string, unknown> = {};
  const keys = ['name', 'muscleGroup', 'description'];
  for (const key of keys) {
    if (key in body) {
      allowed[key] = body[key];
    }
  }
  return allowed;
}

const router = createRouter();

router.get(
  '/',
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
    } catch {
      return c.json({ message: 'Failed to fetch exercises' }, 500);
    }
  }),
);

router.post(
  '/',
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
    } catch {
      return c.json({ message: 'Failed to create exercise' }, 500);
    }
  }),
);

router.get(
  '/:id',
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
    } catch {
      return c.json({ message: 'Failed to fetch exercise' }, 500);
    }
  }),
);

router.put(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const body = await c.req.json();
      const allowed = buildExerciseUpdate(body);
      const result = await db
        .update(schema.exercises)
        .set({
          ...allowed,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
        .returning()
        .get();
      if (!result) {
        return c.json({ message: 'Exercise not found' }, 404);
      }
      return c.json(result);
    } catch {
      return c.json({ message: 'Failed to update exercise' }, 500);
    }
  }),
);

router.delete(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const result = await db
        .update(schema.exercises)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
        .run();
      return c.json({ success: result.success });
    } catch {
      return c.json({ message: 'Failed to delete exercise' }, 500);
    }
  }),
);

export default router;
