import { eq, and } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createHandler } from '../auth';
import { requireOwnedNutritionEntry } from '../guards';

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
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  let nextLoggedAt: Date | undefined;

  if (body.loggedAt !== undefined) {
    nextLoggedAt = new Date(body.loggedAt);

    if (Number.isNaN(nextLoggedAt.getTime())) {
      return c.json({ error: 'Invalid loggedAt value' }, 400);
    }
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
      ...(nextLoggedAt !== undefined
        ? {
            loggedAt: nextLoggedAt,
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

  const existing = await requireOwnedNutritionEntry({ db, userId }, id);
  if (existing instanceof Response) return existing;

  if (existing.isDeleted) {
    return c.body(null, 204);
  }

  await db
    .update(schema.nutritionEntries)
    .set({
      isDeleted: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.nutritionEntries.id, id))
    .run();

  return c.body(null, 204);
});
