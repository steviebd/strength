import { eq, and, sql } from 'drizzle-orm';
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

export function getRateLimitByEndpoint(path: string): number {
  if (path.startsWith('/api/auth/sign-in/') || path.startsWith('/api/auth/sign-up/')) {
    return 20;
  }
  if (path === '/api/nutrition/chat') {
    return 60;
  }
  return 500;
}

export async function checkRateLimit(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  endpoint: string,
  limitPerHour: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

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
    .onConflictDoUpdate({
      target: [schema.rateLimit.userId, schema.rateLimit.endpoint],
      set: {
        requests: sql`CASE WHEN window_start < ${windowStart} THEN 1 ELSE min(requests + 1, ${limitPerHour + 1}) END`,
        windowStart: sql`CASE WHEN window_start < ${windowStart} THEN ${windowStart} ELSE window_start END`,
        updatedAt: new Date(now),
      },
    })
    .run();

  const current = await db
    .select()
    .from(schema.rateLimit)
    .where(and(eq(schema.rateLimit.userId, userId), eq(schema.rateLimit.endpoint, endpoint)))
    .get();

  if (!current || current.windowStart.getTime() < windowStart) {
    return { allowed: false, remaining: 0 };
  }

  if (current.requests <= limitPerHour) {
    return { allowed: true, remaining: limitPerHour - current.requests };
  }

  const retryAfter = Math.ceil((current.windowStart.getTime() + 60 * 60 * 1000 - now) / 1000);
  return { allowed: false, remaining: 0, retryAfter: retryAfter > 0 ? retryAfter : 0 };
}
