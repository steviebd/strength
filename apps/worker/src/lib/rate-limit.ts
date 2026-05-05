import { eq, and, lt, sql } from 'drizzle-orm';
import * as schema from '@strength/db';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

const MAX_RETRIES = 3;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export function getRateLimitPerHour(env: { RATE_LIMIT_REQUEST_PER_HOUR?: string }): number {
  const parsed = Number(env.RATE_LIMIT_REQUEST_PER_HOUR);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 1000;
}

export async function checkRateLimit(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  endpoint: string,
  limitPerHour: number,
  retries = MAX_RETRIES,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

  try {
    await db
      .insert(schema.rateLimit)
      .values({
        userId,
        endpoint,
        requests: 1,
        windowStart: new Date(windowStart),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .run();
    return { allowed: true, remaining: limitPerHour - 1 };
  } catch (err: any) {
    const message = err?.message ?? '';
    if (!message.includes('UNIQUE constraint') && !message.includes('SQLITE_CONSTRAINT')) {
      throw err;
    }
  }

  const existing = await db
    .select()
    .from(schema.rateLimit)
    .where(and(eq(schema.rateLimit.userId, userId), eq(schema.rateLimit.endpoint, endpoint)))
    .get();

  if (!existing) {
    if (retries <= 1) {
      return { allowed: false, remaining: 0 };
    }
    return checkRateLimit(db, userId, endpoint, limitPerHour, retries - 1);
  }

  const existingWindowStart = existing.windowStart.getTime();

  // Old window — atomically reset with optimistic concurrency check
  if (existingWindowStart < windowStart) {
    const result = await db
      .update(schema.rateLimit)
      .set({
        requests: 1,
        windowStart: new Date(windowStart),
        updatedAt: new Date(now),
      })
      .where(
        and(
          eq(schema.rateLimit.id, existing.id),
          eq(schema.rateLimit.windowStart, existing.windowStart),
        ),
      )
      .run();

    const resetRowsAffected = result.meta?.changes ?? 0;
    if (resetRowsAffected === 0) {
      if (retries <= 1) {
        return { allowed: false, remaining: 0 };
      }
      return checkRateLimit(db, userId, endpoint, limitPerHour, retries - 1);
    }

    return { allowed: true, remaining: limitPerHour - 1 };
  }

  // Current window — atomically increment with limit check in WHERE
  const incrementResult = await db
    .update(schema.rateLimit)
    .set({
      requests: sql`requests + 1`,
      updatedAt: new Date(now),
    })
    .where(
      and(
        eq(schema.rateLimit.id, existing.id),
        eq(schema.rateLimit.windowStart, existing.windowStart),
        lt(schema.rateLimit.requests, limitPerHour),
      ),
    )
    .run();

  const incrementRowsAffected = incrementResult.meta?.changes ?? 0;
  if (incrementRowsAffected > 0) {
    const updated = await db
      .select()
      .from(schema.rateLimit)
      .where(and(eq(schema.rateLimit.userId, userId), eq(schema.rateLimit.endpoint, endpoint)))
      .get();

    if (!updated) {
      if (retries <= 1) {
        return { allowed: false, remaining: 0 };
      }
      return checkRateLimit(db, userId, endpoint, limitPerHour, retries - 1);
    }

    return { allowed: true, remaining: limitPerHour - updated.requests };
  }

  // Increment failed — re-read to distinguish limit-reached from window-reset-by-other
  const current = await db
    .select()
    .from(schema.rateLimit)
    .where(and(eq(schema.rateLimit.userId, userId), eq(schema.rateLimit.endpoint, endpoint)))
    .get();

  if (!current || current.windowStart.getTime() < windowStart) {
    if (retries <= 1) {
      return { allowed: false, remaining: 0 };
    }
    return checkRateLimit(db, userId, endpoint, limitPerHour, retries - 1);
  }

  const retryAfter = Math.ceil((current.windowStart.getTime() + 60 * 60 * 1000 - now) / 1000);
  return { allowed: false, remaining: 0, retryAfter: retryAfter > 0 ? retryAfter : 0 };
}
