import { eq, and, inArray, desc } from 'drizzle-orm';
import * as schema from '@strength/db';
import { chunkedQueryMany } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import type { AppDb } from '../api/auth';
import { requireOwnedRecord } from '../api/guards';
import { pickAllowedKeys } from '../lib/validation';

const router = createRouter();

router.get(
  '/',
  createHandler(async (c, { userId, db }) => {
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
            addedWeight: schema.templateExercises.addedWeight,
            repsRaw: schema.templateExercises.repsRaw,
            exerciseType: schema.templateExercises.exerciseType,
            targetDuration: schema.templateExercises.targetDuration,
            targetDistance: schema.templateExercises.targetDistance,
            targetHeight: schema.templateExercises.targetHeight,
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
  }),
);

router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    const body = await c.req.json();
    const { name, description, notes } = body;
    if (!name) {
      return c.json({ message: 'Name is required' }, 400);
    }
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
    return c.json(result, 201);
  }),
);

router.get(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const template = await requireOwnedRecord({ userId, db }, schema.templates, id, {
      extraConditions: [eq(schema.templates.isDeleted, false)],
      notFoundBody: { message: 'Template not found' },
    });
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
        exerciseType: schema.templateExercises.exerciseType,
        targetDuration: schema.templateExercises.targetDuration,
        targetDistance: schema.templateExercises.targetDistance,
        targetHeight: schema.templateExercises.targetHeight,
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
  }),
);

router.put(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
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
      return c.json({ message: 'Template not found' }, 404);
    }

    const allowed = pickAllowedKeys(body, ['name', 'description', 'notes']);

    await db
      .update(schema.templates)
      .set({ ...allowed, updatedAt: new Date() })
      .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
      .run();

    const updatedTemplate = await db
      .select()
      .from(schema.templates)
      .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
      .get();

    if (!updatedTemplate) {
      return c.json({ message: 'Failed to update template' }, 500);
    }

    return c.json(updatedTemplate);
  }),
);

router.delete(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const result = await db
      .update(schema.templates)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
      .run();
    return c.json({ success: result.success });
  }),
);

router.get(
  '/:id/exercises',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const template = await requireOwnedRecord({ userId, db }, schema.templates, id, {
      extraConditions: [eq(schema.templates.isDeleted, false)],
      notFoundBody: { message: 'Template not found' },
    });
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
        exerciseType: schema.templateExercises.exerciseType,
        targetDuration: schema.templateExercises.targetDuration,
        targetDistance: schema.templateExercises.targetDistance,
        targetHeight: schema.templateExercises.targetHeight,
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
  }),
);

router.post(
  '/:id/exercises',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const template = await requireOwnedRecord({ userId, db }, schema.templates, id, {
      extraConditions: [eq(schema.templates.isDeleted, false)],
      notFoundBody: { message: 'Template not found' },
    });
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
      exerciseType,
      targetDuration,
      targetDistance,
      targetHeight,
      isAmrap,
      isAccessory,
      isRequired,
    } = body;
    if (!exerciseId || orderIndex === undefined) {
      return c.json({ message: 'exerciseId and orderIndex are required' }, 400);
    }

    let resolvedExerciseType =
      typeof exerciseType === 'string' &&
      ['weighted', 'bodyweight', 'timed', 'cardio', 'plyo'].includes(exerciseType)
        ? exerciseType
        : 'weighted';

    let resolvedExerciseId = exerciseId;

    const existingExercise = await db
      .select({
        id: schema.exercises.id,
        libraryId: schema.exercises.libraryId,
        exerciseType: schema.exercises.exerciseType,
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
          libraryId: schema.exercises.libraryId,
          exerciseType: schema.exercises.exerciseType,
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
        const libraryExercise = existingLibraryExercise.libraryId
          ? schema.exerciseLibrary.find(
              (exercise) => exercise.id === existingLibraryExercise.libraryId,
            )
          : null;
        resolvedExerciseType =
          libraryExercise?.exerciseType ??
          existingLibraryExercise.exerciseType ??
          resolvedExerciseType;
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
            exerciseType: libraryExercise.exerciseType,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: schema.exercises.id })
          .get();

        if (!createdExercise) {
          return c.json({ message: 'Failed to create exercise' }, 500);
        }

        resolvedExerciseId = createdExercise.id;
        resolvedExerciseType = libraryExercise.exerciseType;
      }
    } else if (existingExercise.libraryId) {
      const libraryExercise = schema.exerciseLibrary.find(
        (exercise) => exercise.id === existingExercise.libraryId,
      );
      resolvedExerciseType =
        libraryExercise?.exerciseType ?? existingExercise.exerciseType ?? resolvedExerciseType;
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
        exerciseType: resolvedExerciseType,
        targetDuration: targetDuration ?? null,
        targetDistance: targetDistance ?? null,
        targetHeight: targetHeight ?? null,
        isAmrap: isAmrap || false,
        isAccessory: isAccessory || false,
        isRequired: isRequired !== false,
      })
      .returning()
      .get();
    return c.json(result, 201);
  }),
);

router.delete(
  '/:id/exercises/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const { id, exerciseId } = c.req.param();
    const template = await requireOwnedRecord({ userId, db }, schema.templates, id, {
      extraConditions: [eq(schema.templates.isDeleted, false)],
      notFoundBody: { message: 'Template not found' },
    });
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
  }),
);

router.post(
  '/:id/copy',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const newTemplate = await db.transaction(async (tx) => {
      const original = await requireOwnedRecord(
        { userId, db: tx as unknown as AppDb },
        schema.templates,
        id,
        {
          extraConditions: [eq(schema.templates.isDeleted, false)],
          notFoundBody: { message: 'Template not found' },
        },
      );
      if (original instanceof Response) return original;

      const now = new Date();
      const insertedTemplate = await tx
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

      const originalExercises = await tx
        .select()
        .from(schema.templateExercises)
        .where(eq(schema.templateExercises.templateId, id))
        .orderBy(schema.templateExercises.orderIndex)
        .all();

      if (originalExercises.length > 0) {
        await tx.insert(schema.templateExercises).values(
          originalExercises.map((te) => ({
            templateId: insertedTemplate.id,
            exerciseId: te.exerciseId,
            orderIndex: te.orderIndex,
            targetWeight: te.targetWeight,
            addedWeight: te.addedWeight,
            sets: te.sets,
            reps: te.reps,
            repsRaw: te.repsRaw,
            exerciseType: te.exerciseType,
            targetDuration: te.targetDuration,
            targetDistance: te.targetDistance,
            targetHeight: te.targetHeight,
            isAmrap: te.isAmrap,
            isAccessory: te.isAccessory,
            isRequired: te.isRequired,
            setNumber: te.setNumber,
          })),
        );
      }

      return insertedTemplate;
    });

    if (newTemplate instanceof Response) {
      return newTemplate;
    }

    return c.json(newTemplate, 201);
  }),
);

export default router;
