import { eq, and } from 'drizzle-orm';
import { formatLocalDate } from '@strength/db';
import * as schema from '@strength/db';
import { createHandler } from '../auth';
import { requireOwnedNutritionEntry } from '../guards';
import { resolveUserTimezone } from '../../lib/timezone';

export const getEntryHandler = createHandler(async (c, { userId, db }) => {
  const id = c.req.param('id') as string;

  const entry = await requireOwnedNutritionEntry({ db, userId }, id);
  if (entry instanceof Response) return entry;

  return c.json(entry);
});

export const updateEntryHandler = createHandler(async (c, { userId, db }) => {
  const id = c.req.param('id') as string;

  const existing = await requireOwnedNutritionEntry({ db, userId }, id);
  if (existing instanceof Response) return existing;

  let body: {
    name?: string;
    mealType?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    loggedAt?: string;
    timezone?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  let nextLoggedAtUtc =
    existing.loggedAtUtc ?? (existing.loggedAt ? new Date(existing.loggedAt) : null);
  let nextTimezone = existing.loggedTimezone ?? null;
  let nextDate = existing.date;

  if (body.loggedAt !== undefined || body.timezone !== undefined) {
    const timezoneResult = await resolveUserTimezone(db, userId, body.timezone ?? nextTimezone);
    if (timezoneResult.error || !timezoneResult.timezone) {
      return c.json({ error: timezoneResult.error }, 400);
    }

    nextTimezone = timezoneResult.timezone;
    nextLoggedAtUtc =
      body.loggedAt !== undefined ? new Date(body.loggedAt) : (nextLoggedAtUtc ?? new Date());

    if (Number.isNaN(nextLoggedAtUtc.getTime())) {
      return c.json({ error: 'Invalid loggedAt value' }, 400);
    }

    nextDate = formatLocalDate(nextLoggedAtUtc, nextTimezone);
  }

  const updated = await db
    .update(schema.nutritionEntries)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.mealType !== undefined && { mealType: body.mealType }),
      ...(body.calories !== undefined && { calories: body.calories }),
      ...(body.proteinG !== undefined && { proteinG: body.proteinG }),
      ...(body.carbsG !== undefined && { carbsG: body.carbsG }),
      ...(body.fatG !== undefined && { fatG: body.fatG }),
      ...(body.loggedAt !== undefined || body.timezone !== undefined
        ? {
            loggedAt: nextLoggedAtUtc?.toISOString() ?? existing.loggedAt,
            loggedAtUtc: nextLoggedAtUtc,
            loggedTimezone: nextTimezone,
            date: nextDate,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.nutritionEntries.id, id), eq(schema.nutritionEntries.userId, userId)))
    .returning()
    .get();

  if (!updated) {
    return c.json({ error: 'Nutrition entry not found' }, 404);
  }

  return c.json(updated);
});

export const deleteEntryHandler = createHandler(async (c, { userId, db }) => {
  const id = c.req.param('id') as string;

  const existing = await db
    .select({
      id: schema.nutritionEntries.id,
      isDeleted: schema.nutritionEntries.isDeleted,
    })
    .from(schema.nutritionEntries)
    .where(and(eq(schema.nutritionEntries.id, id), eq(schema.nutritionEntries.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ error: 'Nutrition entry not found' }, 404);
  }

  if (existing.isDeleted) {
    return c.body(null, 204);
  }

  await db
    .update(schema.nutritionEntries)
    .set({
      isDeleted: true,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.nutritionEntries.id, id), eq(schema.nutritionEntries.userId, userId)))
    .run();

  return c.body(null, 204);
});
