import { describe, expect, test } from 'vitest';
import { getUtcRangeForLocalDate, resolveUserTimezone } from './timezone';
import { createMockDb } from '../test/mock-db';

describe('worker timezone helpers', () => {
  test('rejects invalid requested timezone', async () => {
    await expect(resolveUserTimezone(createMockDb(), 'user-1', 'Mars/Base')).resolves.toEqual({
      timezone: null,
      error: 'Invalid timezone',
    });
  });

  test('uses requested timezone before stored timezone', async () => {
    const db = createMockDb({ get: [{ timezone: 'America/New_York' }] });

    await expect(resolveUserTimezone(db, 'user-1', 'Australia/Sydney')).resolves.toEqual({
      timezone: 'Australia/Sydney',
      error: null,
    });
  });

  test('requires timezone when neither requested nor stored exists', async () => {
    const db = createMockDb({ get: [{ timezone: 'Mars/Base' }] });

    await expect(resolveUserTimezone(db, 'user-1')).resolves.toEqual({
      timezone: null,
      error: 'Timezone is required',
    });
  });

  test('delegates local date range conversion', () => {
    const range = getUtcRangeForLocalDate('2026-04-28', 'Australia/Sydney');

    expect(range.start.toISOString()).toBe('2026-04-27T14:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-04-28T14:00:00.000Z');
  });
});

