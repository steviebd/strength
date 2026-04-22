import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { requireAuth } from '../auth';

function getDb(c: any) {
  return drizzle(c.env.DB, { schema });
}

export async function getEntryHandler(c: any) {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);

  const id = c.req.param('id');

  const entry = await db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.id, id),
        eq(schema.nutritionEntries.userId, userId),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .get();

  if (!entry) {
    return c.json({ error: 'Nutrition entry not found' }, 404);
  }

  return c.json(entry);
}

export async function updateEntryHandler(c: any) {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);

  const id = c.req.param('id');

  const existing = await db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.id, id),
        eq(schema.nutritionEntries.userId, userId),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: 'Nutrition entry not found' }, 404);
  }

  let body: {
    name?: string;
    mealType?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
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
      updatedAt: new Date(),
    })
    .where(and(eq(schema.nutritionEntries.id, id), eq(schema.nutritionEntries.userId, userId)))
    .returning()
    .get();

  if (!updated) {
    return c.json({ error: 'Nutrition entry not found' }, 404);
  }

  return c.json(updated);
}

export async function deleteEntryHandler(c: any) {
  const session = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  const db = getDb(c);

  const id = c.req.param('id');

  const existing = await db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.id, id),
        eq(schema.nutritionEntries.userId, userId),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: 'Nutrition entry not found' }, 404);
  }

  await db
    .update(schema.nutritionEntries)
    .set({
      isDeleted: true,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.nutritionEntries.id, id), eq(schema.nutritionEntries.userId, userId)))
    .run();

  return c.json(null, 204);
}
