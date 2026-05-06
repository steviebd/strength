import { eq, and, inArray, desc } from 'drizzle-orm';
import * as schema from '@strength/db';
import { chunkedQueryMany } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import type { AppDb } from '../api/auth';
import { requireOwnedRecord } from '../api/guards';
import { findExistingUserExerciseByName } from '../lib/program-helpers';
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
        defaultWeightIncrement: schema.templates.defaultWeightIncrement,
        defaultBodyweightIncrement: schema.templates.defaultBodyweightIncrement,
        defaultCardioIncrement: schema.templates.defaultCardioIncrement,
        defaultTimedIncrement: schema.templates.defaultTimedIncrement,
        defaultPlyoIncrement: schema.templates.defaultPlyoIncrement,
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
    const {
      id,
      name,
      description,
      notes,
      defaultWeightIncrement,
      defaultBodyweightIncrement,
      defaultCardioIncrement,
      defaultTimedIncrement,
      defaultPlyoIncrement,
    } = body;
    if (!name) {
      return c.json({ message: 'Name is required' }, 400);
    }
    const now = new Date();

    const progressionFields = {
      defaultWeightIncrement:
        typeof defaultWeightIncrement === 'number' ? defaultWeightIncrement : undefined,
      defaultBodyweightIncrement:
        typeof defaultBodyweightIncrement === 'number' ? defaultBodyweightIncrement : undefined,
      defaultCardioIncrement:
        typeof defaultCardioIncrement === 'number' ? defaultCardioIncrement : undefined,
      defaultTimedIncrement:
        typeof defaultTimedIncrement === 'number' ? defaultTimedIncrement : undefined,
      defaultPlyoIncrement:
        typeof defaultPlyoIncrement === 'number' ? defaultPlyoIncrement : undefined,
    };

    if (typeof id === 'string' && id.trim()) {
      const existing = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, id))
        .get();

      if (existing && existing.userId !== userId) {
        return c.json({ message: 'Template id already exists' }, 409);
      }

      if (existing) {
        const updated = await db
          .update(schema.templates)
          .set({
            name,
            description: description || null,
            notes: notes || null,
            ...progressionFields,
            isDeleted: false,
            updatedAt: now,
          })
          .where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)))
          .returning()
          .get();
        return c.json(updated, 200);
      }
    }

    const result = await db
      .insert(schema.templates)
      .values({
        ...(typeof id === 'string' && id.trim() ? { id } : {}),
        userId,
        name,
        description: description || null,
        notes: notes || null,
        ...progressionFields,
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

    const allowed = pickAllowedKeys(body, [
      'name',
      'description',
      'notes',
      'defaultWeightIncrement',
      'defaultBodyweightIncrement',
      'defaultCardioIncrement',
      'defaultTimedIncrement',
      'defaultPlyoIncrement',
    ]);

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
      id: requestedTemplateExerciseId,
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
    const templateExerciseId =
      typeof requestedTemplateExerciseId === 'string' && requestedTemplateExerciseId.trim()
        ? requestedTemplateExerciseId.trim()
        : undefined;

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

        const existingByName = await findExistingUserExerciseByName(
          db,
          userId,
          libraryExercise.name,
        );
        if (existingByName) {
          resolvedExerciseId = existingByName.id;
          resolvedExerciseType =
            libraryExercise.exerciseType ?? existingByName.exerciseType ?? resolvedExerciseType;
        } else {
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
            .onConflictDoNothing()
            .returning({ id: schema.exercises.id })
            .get();

          if (!createdExercise) {
            const fallbackExercise =
              (await db
                .select({
                  id: schema.exercises.id,
                  exerciseType: schema.exercises.exerciseType,
                })
                .from(schema.exercises)
                .where(
                  and(
                    eq(schema.exercises.userId, userId),
                    eq(schema.exercises.isDeleted, false),
                    eq(schema.exercises.libraryId, libraryExercise.id),
                  ),
                )
                .get()) ?? (await findExistingUserExerciseByName(db, userId, libraryExercise.name));

            if (!fallbackExercise) {
              return c.json({ message: 'Failed to create exercise' }, 500);
            }

            resolvedExerciseId = fallbackExercise.id;
            resolvedExerciseType =
              libraryExercise.exerciseType ?? fallbackExercise.exerciseType ?? resolvedExerciseType;
          } else {
            resolvedExerciseId = createdExercise.id;
            resolvedExerciseType = libraryExercise.exerciseType;
          }
        }
      }
    } else if (existingExercise.libraryId) {
      const libraryExercise = schema.exerciseLibrary.find(
        (exercise) => exercise.id === existingExercise.libraryId,
      );
      resolvedExerciseType =
        libraryExercise?.exerciseType ?? existingExercise.exerciseType ?? resolvedExerciseType;
    }

    const templateExerciseValues = {
      ...(templateExerciseId ? { id: templateExerciseId } : {}),
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
    };

    if (templateExerciseId) {
      const existingTemplateExercise = await db
        .select({
          id: schema.templateExercises.id,
          templateId: schema.templateExercises.templateId,
        })
        .from(schema.templateExercises)
        .where(eq(schema.templateExercises.id, templateExerciseId))
        .get();

      if (existingTemplateExercise && existingTemplateExercise.templateId !== id) {
        return c.json({ message: 'Template exercise id already exists' }, 409);
      }

      if (existingTemplateExercise) {
        const updated = await db
          .update(schema.templateExercises)
          .set(templateExerciseValues)
          .where(
            and(
              eq(schema.templateExercises.id, templateExerciseId),
              eq(schema.templateExercises.templateId, id),
            ),
          )
          .returning()
          .get();
        return c.json(updated);
      }
    }

    const result = await db
      .insert(schema.templateExercises)
      .values(templateExerciseValues)
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

router.put(
  '/:id/exercise-rows/:templateExerciseId',
  createHandler(async (c, { userId, db }) => {
    const { id, templateExerciseId } = c.req.param();
    const template = await requireOwnedRecord({ userId, db }, schema.templates, id, {
      extraConditions: [eq(schema.templates.isDeleted, false)],
      notFoundBody: { message: 'Template not found' },
    });
    if (template instanceof Response) return template;

    const existing = await db
      .select({ id: schema.templateExercises.id, orderIndex: schema.templateExercises.orderIndex })
      .from(schema.templateExercises)
      .where(
        and(
          eq(schema.templateExercises.id, templateExerciseId),
          eq(schema.templateExercises.templateId, id),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ message: 'Template exercise not found' }, 404);
    }

    const body = await c.req.json();
    const updateValues: Partial<typeof schema.templateExercises.$inferInsert> = {
      orderIndex: typeof body.orderIndex === 'number' ? body.orderIndex : existing.orderIndex,
      targetWeight: typeof body.targetWeight === 'number' ? body.targetWeight : null,
      addedWeight: typeof body.addedWeight === 'number' ? body.addedWeight : 0,
      sets: typeof body.sets === 'number' ? body.sets : null,
      reps: typeof body.reps === 'number' ? body.reps : null,
      repsRaw: typeof body.repsRaw === 'string' ? body.repsRaw : null,
      exerciseType: typeof body.exerciseType === 'string' ? body.exerciseType : 'weighted',
      targetDuration: typeof body.targetDuration === 'number' ? body.targetDuration : null,
      targetDistance: typeof body.targetDistance === 'number' ? body.targetDistance : null,
      targetHeight: typeof body.targetHeight === 'number' ? body.targetHeight : null,
      isAmrap: body.isAmrap === true,
      isAccessory: body.isAccessory === true,
      isRequired: body.isRequired !== false,
    };

    const result = await db
      .update(schema.templateExercises)
      .set({
        orderIndex: updateValues.orderIndex,
        targetWeight: updateValues.targetWeight,
        addedWeight: updateValues.addedWeight,
        sets: updateValues.sets,
        reps: updateValues.reps,
        repsRaw: updateValues.repsRaw,
        exerciseType: updateValues.exerciseType,
        targetDuration: updateValues.targetDuration,
        targetDistance: updateValues.targetDistance,
        targetHeight: updateValues.targetHeight,
        isAmrap: updateValues.isAmrap,
        isAccessory: updateValues.isAccessory,
        isRequired: updateValues.isRequired,
      })
      .where(
        and(
          eq(schema.templateExercises.id, templateExerciseId),
          eq(schema.templateExercises.templateId, id),
        ),
      )
      .returning()
      .get();

    return c.json(result);
  }),
);

router.delete(
  '/:id/exercise-rows/:templateExerciseId',
  createHandler(async (c, { userId, db }) => {
    const { id, templateExerciseId } = c.req.param();
    const template = await requireOwnedRecord({ userId, db }, schema.templates, id, {
      extraConditions: [eq(schema.templates.isDeleted, false)],
      notFoundBody: { message: 'Template not found' },
    });
    if (template instanceof Response) return template;

    const result = await db
      .delete(schema.templateExercises)
      .where(
        and(
          eq(schema.templateExercises.id, templateExerciseId),
          eq(schema.templateExercises.templateId, id),
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
