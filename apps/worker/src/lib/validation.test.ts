import { describe, expect, test } from 'vitest';
import { validateDateParam } from './validation';

describe('validateDateParam', () => {
  test('accepts YYYY-MM-DD dates', () => {
    expect(validateDateParam('2026-04-28')).toEqual({ valid: true, date: '2026-04-28' });
  });

  test('rejects missing and malformed dates with stable errors', async () => {
    const missing = validateDateParam(undefined);
    const malformed = validateDateParam('04/28/2026');

    expect(missing.valid).toBe(false);
    if (!missing.valid) {
      expect(missing.response.status).toBe(400);
      await expect(missing.response.json()).resolves.toEqual({
        error: 'date query parameter is required',
      });
    }

    expect(malformed.valid).toBe(false);
    if (!malformed.valid) {
      expect(malformed.response.status).toBe(400);
      await expect(malformed.response.json()).resolves.toEqual({
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }
  });
});
