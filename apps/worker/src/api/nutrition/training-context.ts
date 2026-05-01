import { eq, and } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createHandler } from '../auth';

export const upsertTrainingContextHandler = createHandler(async (c, { userId, db }) => {
  let body: {
    date?: string;
    type?: string;
    trainingType?: string;
    customLabel?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const trainingType = body.trainingType ?? body.type;
  const { customLabel } = body;

  if (!trainingType) {
    return c.json({ error: 'trainingType is required' }, 400);
  }

  const validTypes = ['rest_day', 'cardio', 'powerlifting', 'custom'];
  if (!validTypes.includes(trainingType)) {
    return c.json({ error: 'Invalid trainingType' }, 400);
  }

  const existing = await db
    .select()
    .from(schema.nutritionTrainingContext)
    .where(eq(schema.nutritionTrainingContext.userId, userId))
    .get();

  const now = new Date();
  let result;

  if (existing) {
    result = await db
      .update(schema.nutritionTrainingContext)
      .set({
        trainingType,
        customLabel: customLabel ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.nutritionTrainingContext.id, existing.id),
          eq(schema.nutritionTrainingContext.userId, userId),
        ),
      )
      .returning()
      .get();
  } else {
    result = await db
      .insert(schema.nutritionTrainingContext)
      .values({
        userId,
        trainingType,
        customLabel: customLabel ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  }

  return c.json({
    trainingType: result.trainingType,
    customLabel: result.customLabel,
  });
});
