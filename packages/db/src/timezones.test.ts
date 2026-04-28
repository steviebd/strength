import { describe, expect, test } from 'vitest';
import {
  addDaysToLocalDate,
  formatLocalDate,
  getUtcRangeForLocalDate,
  isValidTimeZone,
  resolveEffectiveTimezone,
  zonedDateTimeToUtc,
} from './timezones';

describe('timezone helpers', () => {
  test('validates and resolves effective timezone', () => {
    expect(isValidTimeZone('Australia/Sydney')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(resolveEffectiveTimezone('Australia/Sydney', 'America/New_York')).toBe(
      'Australia/Sydney',
    );
    expect(resolveEffectiveTimezone('Mars/Base', 'America/New_York')).toBe('America/New_York');
    expect(resolveEffectiveTimezone(null, null)).toBeNull();
  });

  test('formats local dates and adds days across year boundary', () => {
    expect(formatLocalDate('2026-04-27T14:30:00.000Z', 'Australia/Sydney')).toBe('2026-04-28');
    expect(addDaysToLocalDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('converts zoned date time through DST boundaries', () => {
    expect(zonedDateTimeToUtc('2026-04-05', 'Australia/Sydney').toISOString()).toBe(
      '2026-04-04T13:00:00.000Z',
    );
    expect(zonedDateTimeToUtc('2026-10-04', 'Australia/Sydney').toISOString()).toBe(
      '2026-10-03T14:00:00.000Z',
    );
  });

  test('returns UTC range for a local date', () => {
    const range = getUtcRangeForLocalDate('2026-04-28', 'Australia/Sydney');

    expect(range.start.toISOString()).toBe('2026-04-27T14:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-04-28T14:00:00.000Z');
  });
});
