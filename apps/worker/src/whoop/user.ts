import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { eq, and } from 'drizzle-orm';
import { userIntegration, whoopProfile } from '@strength/db';

export async function getWhoopUserId(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
): Promise<string | null> {
  const integration = await db
    .select()
    .from(userIntegration)
    .where(
      and(
        eq(userIntegration.userId, userId),
        eq(userIntegration.provider, 'whoop'),
        eq(userIntegration.isActive, true),
      ),
    )
    .limit(1);

  return integration[0]?.providerUserId ?? null;
}

export async function isWhoopConnected(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
): Promise<boolean> {
  const integration = await db
    .select()
    .from(userIntegration)
    .where(
      and(
        eq(userIntegration.userId, userId),
        eq(userIntegration.provider, 'whoop'),
        eq(userIntegration.isActive, true),
      ),
    )
    .limit(1);

  return !!integration[0];
}

export async function whoopIntegrationExists(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
): Promise<boolean> {
  const integration = await db
    .select()
    .from(userIntegration)
    .where(and(eq(userIntegration.userId, userId), eq(userIntegration.provider, 'whoop')))
    .limit(1);

  return !!integration[0];
}

export async function getWhoopProfileByUserId(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
) {
  const profile = await db
    .select()
    .from(whoopProfile)
    .where(eq(whoopProfile.userId, userId))
    .limit(1);

  return profile[0] ?? null;
}
