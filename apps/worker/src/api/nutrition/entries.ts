import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { formatLocalDate } from '@strength/db';
import * as schema from '@strength/db';
import { requireAuth } from '../auth';
import { resolveUserTimezone } from '../../lib/timezone';

function getDb(c: any) {
  return drizzle(c.env.DB, { schema });
}

export async function getEntriesHandler(c: any) {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);

  const requestedTimezone = c.req.query('timezone');
  const timezoneResult = await resolveUserTimezone(db, userId, requestedTimezone);
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

  const entries = await db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.userId, userId),
        eq(schema.nutritionEntries.date, date),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .orderBy(schema.nutritionEntries.createdAt)
    .all();

  return c.json(entries);
}

export async function createEntryHandler(c: any) {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);

  let body: {
    name?: string;
    mealType?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    timezone?: string;
    loggedAt?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const {
    name,
    mealType,
    calories,
    proteinG,
    carbsG,
    fatG,
    timezone: requestedTimezone,
    loggedAt,
  } = body;

  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const timezoneResult = await resolveUserTimezone(db, userId, requestedTimezone);
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }

  const now = new Date();
  const loggedAtUtc = loggedAt ? new Date(loggedAt) : now;
  if (Number.isNaN(loggedAtUtc.getTime())) {
    return c.json({ error: 'Invalid loggedAt value' }, 400);
  }

  const localDate = formatLocalDate(loggedAtUtc, timezoneResult.timezone);
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
      date: localDate,
      loggedAt: loggedAtUtc.toISOString(),
      loggedAtUtc,
      loggedTimezone: timezoneResult.timezone,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return c.json(entry, 201);
}
