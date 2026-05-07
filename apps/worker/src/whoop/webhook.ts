import type { WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { and, eq, lt } from 'drizzle-orm';
import { userIntegration } from '@strength/db';
import { fetchRecoveryByCycleId, fetchSleepById, fetchWorkoutById } from './client';
import {
  deleteWhoopRecovery,
  deleteWhoopSleep,
  deleteWhoopWorkout,
  upsertWhoopRecovery,
  upsertWhoopSleep,
  upsertWhoopWorkout,
} from './sync';

interface WhoopWebhookEvent {
  eventType: string;
  userId: string;
  objectId: string;
  traceId?: string;
  data: Record<string, unknown>;
}

export function normalizeWhoopWebhookPayload(
  payload: Record<string, unknown>,
): WhoopWebhookEvent | null {
  const eventType = typeof payload.type === 'string' ? payload.type : null;
  const userIdValue = payload.user_id;
  const objectIdValue = payload.id;

  if (!eventType || (typeof userIdValue !== 'string' && typeof userIdValue !== 'number')) {
    return null;
  }

  if (typeof objectIdValue !== 'string' && typeof objectIdValue !== 'number') {
    return null;
  }

  return {
    eventType,
    userId: String(userIdValue),
    objectId: String(objectIdValue),
    traceId: typeof payload.trace_id === 'string' ? payload.trace_id : undefined,
    data: payload,
  };
}

export async function verifyWebhookSignature(
  env: WorkerEnv,
  timestamp: string,
  signature: string,
  rawBody: string,
): Promise<boolean> {
  const webhookSecret = env.WHOOP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return false;
  }

  const numericTimestamp = Number.parseInt(timestamp, 10);
  const now = Date.now();
  const timestampMs =
    Number.isFinite(numericTimestamp) && numericTimestamp < 1_000_000_000_000
      ? numericTimestamp * 1000
      : numericTimestamp;

  if (Number.isNaN(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = encoder.encode(webhookSecret);
  const message = encoder.encode(timestamp + rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return result === 0;
}

export async function resolveWhoopUserId(
  db: DrizzleD1Database<typeof schema>,
  whoopUserId: string,
): Promise<string | null> {
  const integration = await db
    .select({ userId: userIntegration.userId })
    .from(userIntegration)
    .where(
      and(
        eq(userIntegration.providerUserId, whoopUserId),
        eq(userIntegration.provider, 'whoop'),
        eq(userIntegration.isActive, true),
      ),
    )
    .get();

  return integration?.userId ?? null;
}

function getWebhookEventId(event: WhoopWebhookEvent): string {
  if (event.traceId) {
    return event.traceId;
  }
  return `${event.eventType}:${event.userId}:${event.objectId}`;
}

async function recordWebhookEvent(
  db: DrizzleD1Database<typeof schema>,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const now = new Date();
  try {
    await db
      .insert(schema.webhookEventLog)
      .values({
        eventId,
        eventType,
        processedAt: now,
      })
      .run();
  } catch (err: any) {
    const message = err?.message ?? '';
    if (message.includes('UNIQUE constraint') || message.includes('SQLITE_CONSTRAINT')) {
      return false;
    }
    throw err;
  }

  // Clean up entries older than 6 minutes
  const cutoff = new Date(Date.now() - 6 * 60 * 1000);
  await db
    .delete(schema.webhookEventLog)
    .where(lt(schema.webhookEventLog.processedAt, cutoff))
    .run();

  return true;
}

async function handleWhoopRecoveryUpdate(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  userId: string,
  sleepId: string,
): Promise<void> {
  const sleep = await fetchSleepById(db, env, userId, sleepId);

  if (sleep.cycle_id == null) {
    throw new Error(`WHOOP sleep ${sleepId} did not include a cycle_id`);
  }

  const recovery = await fetchRecoveryByCycleId(db, env, userId, sleep.cycle_id);
  await upsertWhoopSleep(db, userId, sleep);
  await upsertWhoopRecovery(db, userId, recovery);
}

export async function handleWebhookEvent(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  event: WhoopWebhookEvent,
): Promise<{ success: boolean; error?: string; ignored?: boolean }> {
  const eventId = getWebhookEventId(event);
  const isNew = await recordWebhookEvent(db, eventId, event.eventType);
  if (!isNew) {
    return { success: true, ignored: true };
  }

  const userId = await resolveWhoopUserId(db, event.userId);
  if (!userId) {
    return { success: true, ignored: true };
  }

  try {
    switch (event.eventType) {
      case 'workout.updated': {
        const workout = await fetchWorkoutById(db, env, userId, event.objectId);
        await upsertWhoopWorkout(db, userId, workout);
        return { success: true };
      }

      case 'workout.deleted': {
        await deleteWhoopWorkout(db, userId, event.objectId);
        return { success: true };
      }

      case 'sleep.updated': {
        const sleep = await fetchSleepById(db, env, userId, event.objectId);
        await upsertWhoopSleep(db, userId, sleep);
        return { success: true };
      }

      case 'sleep.deleted': {
        await deleteWhoopSleep(db, userId, event.objectId);
        await deleteWhoopRecovery(db, userId, event.objectId);
        return { success: true };
      }

      case 'recovery.updated': {
        await handleWhoopRecoveryUpdate(db, env, userId, event.objectId);
        return { success: true };
      }

      case 'recovery.deleted': {
        await deleteWhoopRecovery(db, userId, event.objectId);
        return { success: true };
      }

      default: {
        return { success: true, ignored: true };
      }
    }
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && e.status === 404) {
      return { success: true, ignored: true };
    }

    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
