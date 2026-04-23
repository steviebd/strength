import { eq } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createHandler } from '../auth';

export const getBodyStatsHandler = createHandler(async (c, { userId, db }) => {
  const stats = await db
    .select()
    .from(schema.userBodyStats)
    .where(eq(schema.userBodyStats.userId, userId))
    .get();

  return c.json(stats ?? null);
});

export const upsertBodyStatsHandler = createHandler(async (c, { userId, db }) => {
  let body: {
    bodyweightKg?: number;
    heightCm?: number;
    targetCalories?: number;
    targetProteinG?: number;
    targetCarbsG?: number;
    targetFatG?: number;
    recordedAt?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const existing = await db
    .select()
    .from(schema.userBodyStats)
    .where(eq(schema.userBodyStats.userId, userId))
    .get();

  const now = new Date();
  let stats;

  if (existing) {
    stats = await db
      .update(schema.userBodyStats)
      .set({
        ...(body.bodyweightKg !== undefined && { bodyweightKg: body.bodyweightKg }),
        ...(body.heightCm !== undefined && { heightCm: body.heightCm }),
        ...(body.targetCalories !== undefined && { targetCalories: body.targetCalories }),
        ...(body.targetProteinG !== undefined && { targetProteinG: body.targetProteinG }),
        ...(body.targetCarbsG !== undefined && { targetCarbsG: body.targetCarbsG }),
        ...(body.targetFatG !== undefined && { targetFatG: body.targetFatG }),
        ...(body.recordedAt && { recordedAt: new Date(body.recordedAt) }),
        updatedAt: now,
      })
      .where(eq(schema.userBodyStats.userId, userId))
      .returning()
      .get();
  } else {
    stats = await db
      .insert(schema.userBodyStats)
      .values({
        userId,
        bodyweightKg: body.bodyweightKg ?? null,
        heightCm: body.heightCm ?? null,
        targetCalories: body.targetCalories ?? null,
        targetProteinG: body.targetProteinG ?? null,
        targetCarbsG: body.targetCarbsG ?? null,
        targetFatG: body.targetFatG ?? null,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  }

  return c.json(stats);
});
