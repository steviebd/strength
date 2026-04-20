import { resolveWorkerEnv, type WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '@strength/db';
import { userIntegration } from '@strength/db';
import { refreshAccessToken } from './auth';
import { encryptToken, decryptToken } from '../utils/crypto';

const REFRESH_BEFORE_HOURS = 24;
const ROTATE_AFTER_DAYS = 7;

interface TokenResult {
  token?: string;
  error?: string;
}

async function getIntegration(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  provider: string,
) {
  const result = await db
    .select()
    .from(userIntegration)
    .where(
      and(
        eq(userIntegration.userId, userId),
        eq(userIntegration.provider, provider),
        eq(userIntegration.isActive, true),
      ),
    )
    .limit(1);
  return result[0] ?? null;
}

async function shouldRotate(integration: typeof userIntegration.$inferSelect): Promise<boolean> {
  if (!integration.accessTokenExpiresAt) return true;

  const expiresAt = new Date(integration.accessTokenExpiresAt).getTime();
  const now = Date.now();

  if (expiresAt - now < REFRESH_BEFORE_HOURS * 60 * 60 * 1000) {
    return true;
  }

  const createdAt = new Date(integration.createdAt).getTime();
  if (now - createdAt > ROTATE_AFTER_DAYS * 24 * 60 * 60 * 1000) {
    return true;
  }

  return false;
}

export async function getValidAccessToken(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
): Promise<TokenResult> {
  const resolvedEnv = resolveWorkerEnv(env);
  const integration = await getIntegration(db, userId, 'whoop');

  if (!integration) {
    return { error: 'No WHOOP integration found' };
  }

  if (!integration.refreshToken) {
    return { error: 'No refresh token available' };
  }

  try {
    let decryptedToken: string;
    try {
      decryptedToken = await decryptToken(integration.accessToken, resolvedEnv.ENCRYPTION_MASTER_KEY!);
    } catch {
      decryptedToken = integration.accessToken;
    }

    if (await shouldRotate(integration)) {
      console.log('[WHOOP Token] Token needs rotation, refreshing...');
      const newTokens = await refreshAccessToken(resolvedEnv, integration.refreshToken);

      const encryptedAccessToken = await encryptToken(
        newTokens.access_token,
        resolvedEnv.ENCRYPTION_MASTER_KEY!,
      );
      const encryptedRefreshToken = await encryptToken(
        newTokens.refresh_token,
        resolvedEnv.ENCRYPTION_MASTER_KEY!,
      );

      await db
        .update(userIntegration)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          accessTokenExpiresAt: new Date(newTokens.expires_at ?? Date.now()),
          updatedAt: new Date(),
        })
        .where(eq(userIntegration.id, integration.id));

      return { token: newTokens.access_token };
    }

    return { token: decryptedToken };
  } catch (error) {
    console.error('[WHOOP Token] Error getting valid access token:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function storeWhoopTokens(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  providerUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  scope: string,
): Promise<void> {
  const resolvedEnv = resolveWorkerEnv(env);
  const encryptedAccessToken = await encryptToken(accessToken, resolvedEnv.ENCRYPTION_MASTER_KEY!);
  const encryptedRefreshToken = await encryptToken(refreshToken, resolvedEnv.ENCRYPTION_MASTER_KEY!);

  const existing = await getIntegration(db, userId, 'whoop');

  if (existing) {
    await db
      .update(userIntegration)
      .set({
        providerUserId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        accessTokenExpiresAt: expiresAt,
        scope,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(userIntegration.id, existing.id));
  } else {
    await db.insert(userIntegration).values({
      userId,
      provider: 'whoop',
      providerUserId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      accessTokenExpiresAt: expiresAt,
      scope,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export async function revokeWhoopIntegration(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
): Promise<void> {
  await db
    .update(userIntegration)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(eq(userIntegration.userId, userId), eq(userIntegration.provider, 'whoop')));
}
