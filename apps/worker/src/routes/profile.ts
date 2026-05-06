import { eq, and } from 'drizzle-orm';
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
    distanceUnit: prefs.distanceUnit ?? 'km',
    heightUnit: prefs.heightUnit ?? 'cm',
    timezone: prefs.timezone ?? null,
    weightPromptedAt: prefs.weightPromptedAt ?? null,
    bodyweightKg: bodyStats?.bodyweightKg ?? null,
    updatedAt: prefs.updatedAt,
  };
}

router.get(
  '/preferences',
  createHandler(async (c, { userId, db }) => {
    const now = new Date();
    await db
      .insert(schema.userPreferences)
      .values({
        userId,
        weightUnit: 'kg',
        distanceUnit: 'km',
        heightUnit: 'cm',
        timezone: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    const prefs = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .get();

    if (!prefs) {
      return c.json({ message: 'Failed to create preferences' }, 500);
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
    const distanceUnit = typeof body.distanceUnit === 'string' ? body.distanceUnit : undefined;
    const heightUnit = typeof body.heightUnit === 'string' ? body.heightUnit : undefined;
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

    if (distanceUnit !== undefined && !['km', 'mi'].includes(distanceUnit)) {
      return c.json({ message: 'Invalid distance unit' }, 400);
    }

    if (heightUnit !== undefined && !['cm', 'in'].includes(heightUnit)) {
      return c.json({ message: 'Invalid height unit' }, 400);
    }

    if (timezone !== undefined && timezone !== null && !isValidTimeZone(timezone)) {
      return c.json({ message: 'Invalid timezone' }, 400);
    }

    let result: typeof schema.userPreferences.$inferSelect | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await db
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .get();

      const now = new Date();
      const nextWeightUnit = weightUnit ?? existing?.weightUnit ?? 'kg';
      const nextDistanceUnit = distanceUnit ?? existing?.distanceUnit ?? 'km';
      const nextHeightUnit = heightUnit ?? existing?.heightUnit ?? 'cm';
      const nextTimezone = timezone === undefined ? (existing?.timezone ?? null) : timezone;
      const nextWeightPromptedAt =
        weightPromptedAt === undefined
          ? (existing?.weightPromptedAt ?? null)
          : weightPromptedAt
            ? new Date(weightPromptedAt)
            : null;

      if (existing) {
        const updated = await db
          .update(schema.userPreferences)
          .set({
            weightUnit: nextWeightUnit,
            distanceUnit: nextDistanceUnit,
            heightUnit: nextHeightUnit,
            timezone: nextTimezone,
            weightPromptedAt: nextWeightPromptedAt,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.userPreferences.userId, userId),
              eq(schema.userPreferences.updatedAt, existing.updatedAt),
            ),
          )
          .returning()
          .get();

        if (updated) {
          result = updated;
          break;
        }
      } else {
        const inserted = await db
          .insert(schema.userPreferences)
          .values({
            userId,
            weightUnit: nextWeightUnit,
            distanceUnit: nextDistanceUnit,
            heightUnit: nextHeightUnit,
            timezone: nextTimezone,
            weightPromptedAt: nextWeightPromptedAt,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning()
          .get();

        if (inserted) {
          result = inserted;
          break;
        }
      }
    }

    if (!result) {
      return c.json({ message: 'Conflict updating preferences, please retry' }, 409);
    }

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
