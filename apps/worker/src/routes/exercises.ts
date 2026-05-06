import { eq, and, like, desc } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { resolveToUserExerciseId, findExistingUserExerciseByName } from '../lib/program-helpers';
import { pickAllowedKeys } from '../lib/validation';

const router = createRouter();

router.get(
  '/',
  createHandler(async (c, { userId, db }) => {
    const search = c.req.query('search');
    const conditions = [eq(schema.exercises.userId, userId), eq(schema.exercises.isDeleted, false)];
    if (search) {
      const escapedSearch = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      conditions.push(like(schema.exercises.name, `%${escapedSearch}%`));
    }
    const results = await db
      .select({
        id: schema.exercises.id,
        name: schema.exercises.name,
        muscleGroup: schema.exercises.muscleGroup,
        description: schema.exercises.description,
        libraryId: schema.exercises.libraryId,
        exerciseType: schema.exercises.exerciseType,
        isAmrap: schema.exercises.isAmrap,
        createdAt: schema.exercises.createdAt,
        updatedAt: schema.exercises.updatedAt,
      })
      .from(schema.exercises)
      .where(and(...conditions))
      .orderBy(desc(schema.exercises.createdAt))
      .limit(50)
      .all();
    return c.json(results);
  }),
);

const VALID_EXERCISE_TYPES = ['weighted', 'bodyweight', 'timed', 'cardio', 'plyo'] as const;

router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    const body = await c.req.json();
    const { name, muscleGroup, description, libraryId } = body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (!trimmedName) {
      return c.json({ message: 'Name is required' }, 400);
    }

    const exerciseType =
      typeof body.exerciseType === 'string' &&
      (VALID_EXERCISE_TYPES as unknown as string[]).includes(body.exerciseType)
        ? body.exerciseType
        : 'weighted';
    const isAmrap = body.isAmrap === true;

    if (libraryId) {
      const libraryExercise = schema.exerciseLibrary.find((exercise) => exercise.id === libraryId);
      const resolvedExerciseType = libraryExercise?.exerciseType ?? exerciseType;
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
        if (
          existingByName.libraryId === libraryId &&
          existingByName.exerciseType !== resolvedExerciseType
        ) {
          const repairedByName = await db
            .update(schema.exercises)
            .set({ exerciseType: resolvedExerciseType, updatedAt: new Date() })
            .where(eq(schema.exercises.id, existingByName.id))
            .returning()
            .get();
          return c.json(repairedByName ?? existingByName, 200);
        }
        return c.json(existingByName, 200);
      }

      if (existingLibraryExercise.exerciseType !== resolvedExerciseType) {
        const repaired = await db
          .update(schema.exercises)
          .set({ exerciseType: resolvedExerciseType, updatedAt: new Date() })
          .where(eq(schema.exercises.id, existingLibraryExercise.id))
          .returning()
          .get();
        return c.json(repaired ?? existingLibraryExercise, 201);
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
        exerciseType,
        isAmrap,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json(result, 201);
  }),
);

router.get(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const result = await db
      .select()
      .from(schema.exercises)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
      .get();
    if (!result) {
      return c.json({ message: 'Exercise not found' }, 404);
    }
    return c.json(result);
  }),
);

router.put(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const allowed = pickAllowedKeys(body, [
      'name',
      'muscleGroup',
      'description',
      'exerciseType',
      'isAmrap',
    ]);
    const allowedExerciseType = allowed.exerciseType;
    if (
      allowedExerciseType !== undefined &&
      typeof allowedExerciseType === 'string' &&
      !(VALID_EXERCISE_TYPES as unknown as string[]).includes(allowedExerciseType)
    ) {
      return c.json({ message: 'Invalid exercise type' }, 400);
    }
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
  }),
);

router.delete(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const result = await db
      .update(schema.exercises)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
      .run();
    return c.json({ success: result.success });
  }),
);

export default router;
