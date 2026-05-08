import { describe, expect, test } from 'vitest';
import {
  checkRateLimit,
  getRateLimitPerHour,
  getRateLimitByEndpoint,
  getRateLimitGranularity,
} from './rate-limit';

describe('getRateLimitPerHour', () => {
  test('returns parsed env value', () => {
    expect(getRateLimitPerHour({ RATE_LIMIT_REQUEST_PER_HOUR: '500' })).toBe(500);
  });

  test('returns default when missing', () => {
    expect(getRateLimitPerHour({})).toBe(1000);
  });

  test('returns default for invalid string', () => {
    expect(getRateLimitPerHour({ RATE_LIMIT_REQUEST_PER_HOUR: 'abc' })).toBe(1000);
  });
});

describe('getRateLimitByEndpoint', () => {
  test('returns 20 for auth sign-in endpoints', () => {
    expect(getRateLimitByEndpoint('/api/auth/sign-in/email')).toBe(20);
  });

  test('returns 20 for auth sign-up endpoints', () => {
    expect(getRateLimitByEndpoint('/api/auth/sign-up/email')).toBe(20);
  });

  test('returns 60 for nutrition chat', () => {
    expect(getRateLimitByEndpoint('/api/nutrition/chat')).toBe(60);
  });

  test('returns 500 for other endpoints', () => {
    expect(getRateLimitByEndpoint('/api/workouts')).toBe(500);
  });
});

describe('getRateLimitGranularity', () => {
  test('returns skip for GET cheap read paths', () => {
    expect(getRateLimitGranularity('GET', '/api/home/summary')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/programs/active')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/programs/latest-1rms')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/nutrition/entries')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/nutrition/daily-summary')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/nutrition/body-stats')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/nutrition/training-context')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/nutrition/chat/jobs/abc')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/nutrition/chat/history')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/exercises')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/exercises/123')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/templates')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/templates/abc')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/me')).toBe('skip');
    expect(getRateLimitGranularity('GET', '/api/profile/preferences')).toBe('skip');
  });

  test('does not skip non-GET on cheap read paths', () => {
    expect(getRateLimitGranularity('POST', '/api/exercises')).toBe('endpoint');
  });

  test('returns endpoint for auth paths', () => {
    expect(getRateLimitGranularity('GET', '/api/auth/sign-in/email')).toBe('endpoint');
    expect(getRateLimitGranularity('POST', '/api/auth/sign-in/email')).toBe('endpoint');
  });

  test('returns endpoint for whoop paths', () => {
    expect(getRateLimitGranularity('GET', '/api/whoop/status')).toBe('endpoint');
  });

  test('returns endpoint for POST nutrition chat', () => {
    expect(getRateLimitGranularity('POST', '/api/nutrition/chat')).toBe('endpoint');
  });

  test('returns endpoint for mutating workout paths', () => {
    expect(getRateLimitGranularity('POST', '/api/workouts/123')).toBe('endpoint');
    expect(getRateLimitGranularity('PUT', '/api/workouts/123')).toBe('endpoint');
    expect(getRateLimitGranularity('DELETE', '/api/workouts/123')).toBe('endpoint');
  });

  test('returns endpoint for general POST/PUT/DELETE', () => {
    expect(getRateLimitGranularity('POST', '/api/programs')).toBe('endpoint');
    expect(getRateLimitGranularity('DELETE', '/api/whatever')).toBe('endpoint');
  });

  test('returns read as default for authenticated GET', () => {
    expect(getRateLimitGranularity('GET', '/api/workouts')).toBe('read');
    expect(getRateLimitGranularity('GET', '/api/programs')).toBe('read');
    expect(getRateLimitGranularity('GET', '/api/something-else')).toBe('read');
  });
});

describe('checkRateLimit', () => {
  test('allows first request', async () => {
    const userId = `first-${Date.now()}`;
    const result = await checkRateLimit(userId, 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('allows request within window', async () => {
    const userId = `within-${Date.now()}`;
    await checkRateLimit(userId, 'test', 10);
    await checkRateLimit(userId, 'test', 10);
    await checkRateLimit(userId, 'test', 10);
    await checkRateLimit(userId, 'test', 10);
    const result = await checkRateLimit(userId, 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });

  test('blocks when limit reached', async () => {
    const userId = `block-${Date.now()}`;
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      await checkRateLimit(userId, 'test', limit);
    }
    const result = await checkRateLimit(userId, 'test', limit);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test('retryAfter is positive when blocked', async () => {
    const userId = `retry-${Date.now()}`;
    const limit = 1;
    await checkRateLimit(userId, 'test', limit);
    const result = await checkRateLimit(userId, 'test', limit);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('different endpoints do not share buckets', async () => {
    const userId = `ep-${Date.now()}`;
    const r1 = await checkRateLimit(userId, 'endpoint-a', 10);
    const r2 = await checkRateLimit(userId, 'endpoint-b', 10);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  test('different users do not share buckets', async () => {
    const a = `ua-${Date.now()}`;
    const b = `ub-${Date.now()}`;
    const r1 = await checkRateLimit(a, 'test', 1);
    const r2 = await checkRateLimit(b, 'test', 1);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});
