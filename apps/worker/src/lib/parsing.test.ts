import { describe, expect, test } from 'vitest';
import { getNumber, getObject, getTimestamp, parseJsonObject, withWhoopFallbacks } from './parsing';

describe('parsing helpers', () => {
  test('parses only JSON objects', () => {
    expect(parseJsonObject('{"score":75}')).toEqual({ score: 75 });
    expect(parseJsonObject('[1,2]')).toBeNull();
    expect(parseJsonObject('bad')).toBeNull();
    expect(parseJsonObject(null)).toBeNull();
  });

  test('gets object and numeric fields defensively', () => {
    const source = { nested: { value: 1 }, list: [1], finite: '42', infinite: Infinity };

    expect(getObject(source, 'nested')).toEqual({ value: 1 });
    expect(getObject(source, 'list')).toBeNull();
    expect(getNumber(source, 'finite')).toBe(42);
    expect(getNumber(source, 'infinite')).toBeNull();
    expect(getNumber(source, 'missing')).toBeNull();
  });

  test('gets timestamps and applies fallback patches', () => {
    const timestamp = getTimestamp({ at: '2026-04-28T00:00:00.000Z' }, 'at');

    expect(timestamp).toBe(Date.parse('2026-04-28T00:00:00.000Z'));
    expect(getTimestamp({ at: 'not-a-date' }, 'at')).toBeNull();
    expect(withWhoopFallbacks({ a: 1, b: null }, { b: 2, c: 3 })).toEqual({
      a: 1,
      b: 2,
      c: 3,
    });
  });
});
