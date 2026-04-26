import { eq, and, gte, lt } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createHandler } from '../auth';
import { getUtcRangeForLocalDate, resolveUserTimezone } from '../../lib/timezone';

export const getEntriesHandler = createHandler(async (c, { userId, db }) => {
  const timezoneResult = await resolveUserTimezone(db, userId);
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }

  const date = c.req.query('date');

  if (!date) {
    return c.json({ error: 'date query parameter is required' }, 400);
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
  }

  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(
    date,
    timezoneResult.timezone,
  );

  const entries = await db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.userId, userId),
        gte(schema.nutritionEntries.loggedAt, startOfDay),
        lt(schema.nutritionEntries.loggedAt, endOfDay),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .orderBy(schema.nutritionEntries.createdAt)
    .all();

  return c.json(entries);
});

export const createEntryHandler = createHandler(async (c, { userId, db }) => {
  let body: {
    name?: string;
    mealType?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    loggedAt?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { name, mealType, calories, proteinG, carbsG, fatG, loggedAt } = body;

  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const timezoneResult = await resolveUserTimezone(db, userId);
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }

  const now = new Date();
  const loggedAtUtc = loggedAt ? new Date(loggedAt) : now;
  if (Number.isNaN(loggedAtUtc.getTime())) {
    return c.json({ error: 'Invalid loggedAt value' }, 400);
  }

  const entry = await db
    .insert(schema.nutritionEntries)
    .values({
      userId,
      name,
      mealType: mealType ?? null,
      calories: calories ?? null,
      proteinG: proteinG ?? null,
      carbsG: carbsG ?? null,
      fatG: fatG ?? null,
      loggedAt: loggedAtUtc,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return c.json(entry, 201);
});
