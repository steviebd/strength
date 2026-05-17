import { describe, expect, test } from 'vitest';
import { pickAllowedKeys, pickDefinedAllowedKeys, validateDateParam } from './validation';

describe('pickAllowedKeys', () => {
  test('allows specified keys and rejects others', () => {
    const result = pickAllowedKeys({ name: 'A', notes: 'B', evil: true }, ['name', 'notes']);
    expect(result).toEqual({ name: 'A', notes: 'B' });
    expect(result).not.toHaveProperty('evil');
  });

  test('returns empty object when no allowed keys present', () => {
    const result = pickAllowedKeys({ id: '1', userId: 'u1' }, ['name']);
    expect(result).toEqual({});
  });
});

describe('pickDefinedAllowedKeys', () => {
  test('allows specified keys while dropping undefined values', () => {
    const result = pickDefinedAllowedKeys(
      { name: 'A', notes: undefined, description: null, evil: true },
      ['name', 'notes', 'description'],
    );

    expect(result).toEqual({ name: 'A', description: null });
    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('evil');
  });
});

describe('validateDateParam', () => {
  test('accepts YYYY-MM-DD dates', () => {
    expect(validateDateParam('2026-04-28')).toEqual({ valid: true, date: '2026-04-28' });
  });

  test('rejects missing and malformed dates with stable errors', async () => {
    const missing = validateDateParam(undefined);
    const malformed = validateDateParam('04/28/2026');
    const impossible = validateDateParam('2026-02-31');

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

    expect(impossible.valid).toBe(false);
    if (!impossible.valid) {
      expect(impossible.response.status).toBe(400);
      await expect(impossible.response.json()).resolves.toEqual({
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }
  });
});
