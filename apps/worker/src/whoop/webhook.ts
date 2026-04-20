import type { WorkerEnv } from '../auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { eq, and } from 'drizzle-orm';
import { userIntegration } from '@strength/db';
import { syncAllWhoopData } from './sync';

export interface WhoopWebhookEvent {
  eventType: string;
  userId: string;
  data: Record<string, unknown>;
}

export async function verifyWebhookSignature(
  env: WorkerEnv,
  timestamp: string,
  signature: string,
  rawBody: string,
): Promise<boolean> {
  const webhookSecret = env.WHOOP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[WHOOP Webhook] No webhook secret configured');
    return false;
  }

  const timestampMs = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    console.error('[WHOOP Webhook] Timestamp too old or invalid');
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
    .select()
    .from(userIntegration)
    .where(
      and(
        eq(userIntegration.providerUserId, whoopUserId),
        eq(userIntegration.provider, 'whoop'),
        eq(userIntegration.isActive, true),
      ),
    )
    .limit(1);

  return integration[0]?.userId ?? null;
}

export async function handleWebhookEvent(
  db: DrizzleD1Database<typeof schema>,
  env: WorkerEnv,
  event: WhoopWebhookEvent,
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WHOOP Webhook] Handling event: ${event.eventType} for user ${event.userId}`);

  const userId = await resolveWhoopUserId(db, event.userId);
  if (!userId) {
    console.log(
      `[WHOOP Webhook] Unknown WHOOP user ${event.userId}, attempting to find via integration...`,
    );

    return { success: false, error: 'User not found' };
  }

  try {
    const eventType = event.eventType;

    if (eventType.includes('workout')) {
      await syncAllWhoopData(db, env, userId);
    } else if (eventType.includes('recovery')) {
      await syncAllWhoopData(db, env, userId);
    } else if (eventType.includes('sleep')) {
      await syncAllWhoopData(db, env, userId);
    } else if (eventType.includes('cycle')) {
      await syncAllWhoopData(db, env, userId);
    } else if (eventType.includes('body_measurement')) {
      await syncAllWhoopData(db, env, userId);
    } else if (eventType.includes('user_profile')) {
      await syncAllWhoopData(db, env, userId);
    }

    return { success: true };
  } catch (e) {
    console.error(`[WHOOP Webhook] Error handling event:`, e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
