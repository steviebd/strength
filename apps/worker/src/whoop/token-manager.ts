import type { WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import {
  forceRefreshAccessToken,
  getValidAccessToken,
  revokeWhoopIntegration,
} from './token-rotation';
import { WhoopReauthRequiredError, WhoopSessionExpiredError } from './errors';

function getHttpStatus(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : null;
  }

  return null;
}

function getTokenError(error: string | undefined) {
  const normalized = error?.toLowerCase() ?? '';

  if (normalized.includes('no refresh token')) {
    return new WhoopReauthRequiredError('no_refresh_token');
  }

  return new WhoopSessionExpiredError(error ?? undefined);
}

export async function getValidWhoopToken(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
): Promise<string> {
  const tokenResult = await getValidAccessToken(db, env, userId);

  if (!tokenResult.token) {
    throw getTokenError(tokenResult.error);
  }

  return tokenResult.token;
}

export async function withValidToken<T>(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  label: string,
  action: (token: string) => Promise<T>,
): Promise<T> {
  const token = await getValidWhoopToken(db, env, userId);

  try {
    return await action(token);
  } catch (error) {
    if (getHttpStatus(error) !== 401) {
      throw error;
    }
  }

  const refreshed = await forceRefreshAccessToken(db, env, userId);
  if (!refreshed.token) {
    await revokeWhoopIntegration(db, userId);
    throw new WhoopReauthRequiredError(
      'refresh_failed',
      `${label} token refresh failed. Please reconnect WHOOP.`,
    );
  }

  try {
    return await action(refreshed.token);
  } catch (error) {
    if (getHttpStatus(error) === 401) {
      await revokeWhoopIntegration(db, userId);
      throw new WhoopReauthRequiredError('token_revoked');
    }

    throw error;
  }
}
