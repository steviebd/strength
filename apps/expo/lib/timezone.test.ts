import { describe, expect, test, vi } from 'vitest';
import { getActiveTimezone, getCurrentDeviceTimezone } from './timezone';

describe('expo timezone helpers', () => {
  test('prefers valid device timezone over profile timezone', () => {
    expect(getActiveTimezone('America/New_York', 'Australia/Sydney')).toBe('Australia/Sydney');
  });

  test('falls back to profile timezone when device timezone is invalid', () => {
    expect(getActiveTimezone('America/New_York', 'Mars/Base')).toBe('America/New_York');
  });

  test('returns null when resolved device timezone is invalid', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Mars/Base' }),
    } as never);

    expect(getCurrentDeviceTimezone()).toBeNull();
    spy.mockRestore();
  });
});
