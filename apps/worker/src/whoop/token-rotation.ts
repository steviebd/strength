import { resolveWorkerEnv, type WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and, lt } from 'drizzle-orm';
import * as schema from '@strength/db';
import { userIntegration } from '@strength/db';
import { refreshAccessToken } from './auth';
import { encryptToken, decryptToken } from '../utils/crypto';

const REFRESH_BEFORE_HOURS = 24;
interface TokenResult {
  token?: string;
  error?: string;
}

interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
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

  return false;
}

async function decryptStoredTokens(
  integration: typeof userIntegration.$inferSelect,
  encryptionKey: string,
): Promise<DecryptedTokens> {
  // If decryption fails, the token may be corrupt or the key changed.
  // Let the error propagate so the caller can prompt for re-auth.
  const accessToken = await decryptToken(integration.accessToken, encryptionKey);
  const refreshToken = await decryptToken(integration.refreshToken!, encryptionKey);

  return { accessToken, refreshToken };
}

async function cleanupExpiredLocks(db: DrizzleD1Database<typeof schema>) {
  await db
    .delete(schema.tokenRefreshLock)
    .where(lt(schema.tokenRefreshLock.expiresAt, new Date(Date.now())));
}

export async function acquireLock(
  db: DrizzleD1Database<typeof schema>,
  integrationId: string,
  ttlMs: number,
): Promise<boolean> {
  const now = Date.now();
  const expiresAt = now + ttlMs;

  await cleanupExpiredLocks(db);

  try {
    await db.insert(schema.tokenRefreshLock).values({
      integrationId,
      lockedAt: new Date(now),
      expiresAt: new Date(expiresAt),
    });
    return true;
  } catch (error) {
    const isUniqueViolation =
      error instanceof Error &&
      (error.message.includes('UNIQUE constraint failed') ||
        error.message.includes('unique constraint'));
    if (!isUniqueViolation) {
      throw error;
    }
    return false;
  }
}

async function waitForLock(
  db: DrizzleD1Database<typeof schema>,
  integrationId: string,
  maxWaitMs: number,
  pollIntervalMs = 500,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const existing = await db
      .select()
      .from(schema.tokenRefreshLock)
      .where(eq(schema.tokenRefreshLock.integrationId, integrationId))
      .get();

    if (!existing) {
      return true;
    }

    if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) {
      await db
        .delete(schema.tokenRefreshLock)
        .where(eq(schema.tokenRefreshLock.integrationId, integrationId));
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

export async function releaseLock(db: DrizzleD1Database<typeof schema>, integrationId: string) {
  await db
    .delete(schema.tokenRefreshLock)
    .where(eq(schema.tokenRefreshLock.integrationId, integrationId));
}

async function refreshWithLock(
  db: DrizzleD1Database<typeof schema>,
  env: ReturnType<typeof resolveWorkerEnv>,
  integration: typeof userIntegration.$inferSelect,
  refresh: () => Promise<string>,
): Promise<string> {
  const acquired = await acquireLock(db, integration.id, 30_000);
  if (!acquired) {
    const becameFree = await waitForLock(db, integration.id, 30_000);
    if (becameFree) {
      const refreshed = await getIntegration(db, integration.userId, 'whoop');
      if (refreshed?.accessToken) {
        const { accessToken } = await decryptStoredTokens(refreshed, env.ENCRYPTION_MASTER_KEY!);
        return accessToken;
      }
    }
    throw new Error('Timed out waiting for token refresh lock');
  }

  try {
    const token = await refresh();
    return token;
  } finally {
    await releaseLock(db, integration.id);
  }
}

async function refreshWhoopAccessToken(
  db: DrizzleD1Database<typeof schema>,
  env: ReturnType<typeof resolveWorkerEnv>,
  integration: typeof userIntegration.$inferSelect,
  refreshToken: string,
): Promise<string> {
  const newTokens = await refreshAccessToken(env, refreshToken);

  const encryptedAccessToken = await encryptToken(
    newTokens.access_token,
    env.ENCRYPTION_MASTER_KEY!,
  );
  const nextRefreshToken = newTokens.refresh_token || refreshToken;
  const encryptedRefreshToken = await encryptToken(nextRefreshToken, env.ENCRYPTION_MASTER_KEY!);

  const result = await db
    .update(userIntegration)
    .set({
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      accessTokenExpiresAt: new Date(newTokens.expires_at ?? Date.now()),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userIntegration.id, integration.id),
        eq(userIntegration.updatedAt, integration.updatedAt),
      ),
    )
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    // Another request already refreshed; re-read and return the new token
    const refreshed = await getIntegration(db, integration.userId, 'whoop');
    if (!refreshed) throw new Error('Integration disappeared during refresh');
    const { accessToken } = await decryptStoredTokens(refreshed, env.ENCRYPTION_MASTER_KEY!);
    return accessToken;
  }

  return newTokens.access_token;
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
    const { accessToken, refreshToken } = await decryptStoredTokens(
      integration,
      resolvedEnv.ENCRYPTION_MASTER_KEY!,
    );

    if (await shouldRotate(integration)) {
      const token = await refreshWithLock(db, resolvedEnv, integration, () =>
        refreshWhoopAccessToken(db, resolvedEnv, integration, refreshToken),
      );
      return { token };
    }

    return { token: accessToken };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function forceRefreshAccessToken(
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
    const { refreshToken } = await decryptStoredTokens(
      integration,
      resolvedEnv.ENCRYPTION_MASTER_KEY!,
    );
    const token = await refreshWithLock(db, resolvedEnv, integration, () =>
      refreshWhoopAccessToken(db, resolvedEnv, integration, refreshToken),
    );
    return { token };
  } catch (error) {
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
  const encryptedRefreshToken = await encryptToken(
    refreshToken,
    resolvedEnv.ENCRYPTION_MASTER_KEY!,
  );

  await db
    .insert(userIntegration)
    .values({
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
    })
    .onConflictDoUpdate({
      target: [userIntegration.userId, userIntegration.provider],
      set: {
        providerUserId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        accessTokenExpiresAt: expiresAt,
        scope,
        isActive: true,
        updatedAt: new Date(),
      },
    });
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
