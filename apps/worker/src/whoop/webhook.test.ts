import { describe, expect, test } from 'vitest';

import { normalizeWhoopWebhookPayload, verifyWebhookSignature } from './webhook';

async function createSignature(secret: string, timestamp: string, rawBody: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(timestamp + rawBody),
  );

  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

describe('normalizeWhoopWebhookPayload', () => {
  test('normalizes WHOOP v2 webhook fields', () => {
    expect(
      normalizeWhoopWebhookPayload({
        id: '550e8400-e29b-41d4-a716-446655440000',
        trace_id: 'trace-123',
        type: 'sleep.updated',
        user_id: 456,
      }),
    ).toEqual({
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        trace_id: 'trace-123',
        type: 'sleep.updated',
        user_id: 456,
      },
      eventType: 'sleep.updated',
      objectId: '550e8400-e29b-41d4-a716-446655440000',
      traceId: 'trace-123',
      userId: '456',
    });
  });

  test('rejects invalid webhook payloads', () => {
    expect(normalizeWhoopWebhookPayload({ type: 'sleep.updated' })).toBeNull();
  });
});

describe('verifyWebhookSignature', () => {
  test('accepts a valid WHOOP signature', async () => {
    const rawBody = JSON.stringify({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'sleep.updated',
      user_id: 456,
    });
    const timestamp = String(Date.now());
    const secret = 'test-whoop-webhook-secret';
    const signature = await createSignature(secret, timestamp, rawBody);

    await expect(
      verifyWebhookSignature(
        {
          WHOOP_WEBHOOK_SECRET: secret,
        } as never,
        timestamp,
        signature,
        rawBody,
      ),
    ).resolves.toBe(true);
  });

  test('rejects an invalid WHOOP signature', async () => {
    const rawBody = JSON.stringify({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'sleep.updated',
      user_id: 456,
    });

    await expect(
      verifyWebhookSignature(
        {
          WHOOP_WEBHOOK_SECRET: 'test-whoop-webhook-secret',
        } as never,
        String(Date.now()),
        'bad-signature',
        rawBody,
      ),
    ).resolves.toBe(false);
  });

  test('accepts second-based timestamps as well as millisecond timestamps', async () => {
    const rawBody = JSON.stringify({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'workout.updated',
      user_id: 456,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = 'test-whoop-webhook-secret';
    const signature = await createSignature(secret, timestamp, rawBody);

    await expect(
      verifyWebhookSignature(
        {
          WHOOP_WEBHOOK_SECRET: secret,
        } as never,
        timestamp,
        signature,
        rawBody,
      ),
    ).resolves.toBe(true);
  });
});
