import { eq } from 'drizzle-orm';
import * as schema from '@strength/db';
import { isValidTimeZone } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';

const router = createRouter();

export function serializePreferences(
  prefs: typeof schema.userPreferences.$inferSelect,
  bodyStats: typeof schema.userBodyStats.$inferSelect | null,
) {
  return {
    weightUnit: prefs.weightUnit ?? 'kg',
    timezone: prefs.timezone ?? null,
    weightPromptedAt: prefs.weightPromptedAt ?? null,
    bodyweightKg: bodyStats?.bodyweightKg ?? null,
    updatedAt: prefs.updatedAt,
  };
}

router.get(
  '/preferences',
  createHandler(async (c, { userId, db }) => {
    let prefs = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .get();

    if (!prefs) {
      const now = new Date();
      const result = await db
        .insert(schema.userPreferences)
        .values({
          userId,
          weightUnit: 'kg',
          timezone: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      prefs = result;
    }

    const bodyStats = await db
      .select()
      .from(schema.userBodyStats)
      .where(eq(schema.userBodyStats.userId, userId))
      .get();

    return c.json(serializePreferences(prefs, bodyStats ?? null));
  }),
);

router.put(
  '/preferences',
  createHandler(async (c, { userId, db }) => {
    let body: Record<string, unknown> = {};
    try {
      const rawBody = await c.req.text();
      if (rawBody.trim()) {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      }
    } catch {
      // no-op
    }

    const weightUnit = typeof body.weightUnit === 'string' ? body.weightUnit : undefined;
    const timezone =
      body.timezone === null ? null : typeof body.timezone === 'string' ? body.timezone : undefined;
    const weightPromptedAt =
      body.weightPromptedAt === null
        ? null
        : typeof body.weightPromptedAt === 'string'
          ? body.weightPromptedAt
          : undefined;

    if (weightUnit !== undefined && !['kg', 'lbs'].includes(weightUnit)) {
      return c.json({ message: 'Invalid weight unit' }, 400);
    }

    if (timezone !== undefined && timezone !== null && !isValidTimeZone(timezone)) {
      return c.json({ message: 'Invalid timezone' }, 400);
    }

    const existing = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .get();

    const nextWeightUnit = weightUnit ?? existing?.weightUnit ?? 'kg';
    const nextTimezone = timezone === undefined ? (existing?.timezone ?? null) : timezone;
    const nextWeightPromptedAt =
      weightPromptedAt === undefined
        ? (existing?.weightPromptedAt ?? null)
        : weightPromptedAt
          ? new Date(weightPromptedAt)
          : null;

    const now = new Date();
    const result = await db
      .insert(schema.userPreferences)
      .values({
        userId,
        weightUnit: nextWeightUnit,
        timezone: nextTimezone,
        weightPromptedAt: nextWeightPromptedAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.userPreferences.userId,
        set: {
          weightUnit: nextWeightUnit,
          timezone: nextTimezone,
          weightPromptedAt: nextWeightPromptedAt,
          updatedAt: now,
        },
      })
      .returning()
      .get();

    const bodyStats = await db
      .select()
      .from(schema.userBodyStats)
      .where(eq(schema.userBodyStats.userId, userId))
      .get();

    return c.json({
      ...serializePreferences(result, bodyStats ?? null),
    });
  }),
);

export default router;
