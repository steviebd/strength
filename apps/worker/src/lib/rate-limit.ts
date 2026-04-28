import { eq, and } from 'drizzle-orm';
import * as schema from '@strength/db';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

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
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

  const existing = await db
    .select()
    .from(schema.rateLimit)
    .where(and(eq(schema.rateLimit.userId, userId), eq(schema.rateLimit.endpoint, endpoint)))
    .get();

  if (!existing) {
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
  }

  const existingWindowStart = existing.windowStart.getTime();
  if (existingWindowStart < windowStart) {
    await db
      .update(schema.rateLimit)
      .set({
        requests: 1,
        windowStart: new Date(windowStart),
        updatedAt: new Date(now),
      })
      .where(eq(schema.rateLimit.id, existing.id))
      .run();
    return { allowed: true, remaining: limitPerHour - 1 };
  }

  if (existing.requests >= limitPerHour) {
    const retryAfter = Math.ceil((existingWindowStart + 60 * 60 * 1000 - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter: retryAfter > 0 ? retryAfter : 0 };
  }

  await db
    .update(schema.rateLimit)
    .set({
      requests: existing.requests + 1,
      updatedAt: new Date(now),
    })
    .where(eq(schema.rateLimit.id, existing.id))
    .run();

  return { allowed: true, remaining: limitPerHour - (existing.requests + 1) };
}
