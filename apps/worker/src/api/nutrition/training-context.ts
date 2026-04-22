import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { requireAuth } from '../auth';

function getDb(c: any) {
  return drizzle(c.env.DB, { schema });
}

export async function upsertTrainingContextHandler(c: any) {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);

  const date = c.req.query('date');

  if (!date) {
    return c.json({ error: 'date query parameter is required' }, 400);
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
  }

  let body: {
    trainingType?: string;
    customLabel?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { trainingType, customLabel } = body;

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
    .where(
      and(
        eq(schema.nutritionTrainingContext.userId, userId),
        eq(schema.nutritionTrainingContext.date, date),
      ),
    )
    .get();

  const now = new Date();
  let result;

  if (existing) {
    result = await db
      .update(schema.nutritionTrainingContext)
      .set({
        trainingType,
        customLabel: customLabel ?? null,
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
        date,
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
}
