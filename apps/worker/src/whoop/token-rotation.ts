import { resolveWorkerEnv, type WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
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

const refreshLocks = new Map<string, Promise<string>>();

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
  let accessToken: string;
  try {
    accessToken = await decryptToken(integration.accessToken, encryptionKey);
  } catch {
    accessToken = integration.accessToken;
  }

  let refreshToken: string;
  try {
    refreshToken = await decryptToken(integration.refreshToken!, encryptionKey);
  } catch {
    refreshToken = integration.refreshToken!;
  }

  return { accessToken, refreshToken };
}

async function refreshWithLock(
  integrationId: string,
  refresh: () => Promise<string>,
): Promise<string> {
  const existingRefresh = refreshLocks.get(integrationId);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = refresh().finally(() => {
    refreshLocks.delete(integrationId);
  });
  refreshLocks.set(integrationId, refreshPromise);

  return refreshPromise;
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

  await db
    .update(userIntegration)
    .set({
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      accessTokenExpiresAt: new Date(newTokens.expires_at ?? Date.now()),
      updatedAt: new Date(),
    })
    .where(eq(userIntegration.id, integration.id));

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
      const token = await refreshWithLock(integration.id, () =>
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
    const token = await refreshWithLock(integration.id, () =>
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
