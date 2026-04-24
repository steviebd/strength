import { eq, and } from 'drizzle-orm';
import { formatLocalDate } from '@strength/db';
import * as schema from '@strength/db';
import { createHandler } from '../auth';
import { resolveUserTimezone } from '../../lib/timezone';

export const upsertTrainingContextHandler = createHandler(async (c, { userId, db }) => {
  let body: {
    date?: string;
    type?: string;
    trainingType?: string;
    customLabel?: string;
    timezone?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const timezoneResult = await resolveUserTimezone(
    db,
    userId,
    body.timezone ?? c.req.query('timezone'),
  );
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }

  const requestedDate = body.date ?? c.req.query('date');
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return c.json({ error: 'Valid date (YYYY-MM-DD) is required' }, 400);
  }

  const date = requestedDate ?? formatLocalDate(new Date(), timezoneResult.timezone);

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
        eventTimezone: timezoneResult.timezone,
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
        eventTimezone: timezoneResult.timezone,
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
