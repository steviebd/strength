import { describe, expect, test } from 'vitest';
import { computeStreak } from './summary';

describe('computeStreak', () => {
  test('returns 0 when no workouts exist', () => {
    const result = computeStreak('2026-04-28', new Set());
    expect(result).toBe(0);
  });

  test('returns 1 for a single workout today', () => {
    const result = computeStreak('2026-04-28', new Set(['2026-04-28']));
    expect(result).toBe(1);
  });

  test('counts consecutive days', () => {
    const dates = new Set(['2026-04-28', '2026-04-27', '2026-04-26']);
    const result = computeStreak('2026-04-28', dates);
    expect(result).toBe(3);
  });

  test('stops at first skipped day', () => {
    const dates = new Set(['2026-04-28', '2026-04-26', '2026-04-25']);
    const result = computeStreak('2026-04-28', dates);
    expect(result).toBe(1);
  });

  test('handles multiple workouts on the same day', () => {
    const dates = new Set(['2026-04-28', '2026-04-27', '2026-04-27']);
    const result = computeStreak('2026-04-28', dates);
    expect(result).toBe(2);
  });

  test('returns 0 when latest workout is in the past', () => {
    const dates = new Set(['2026-04-26', '2026-04-25']);
    const result = computeStreak('2026-04-28', dates);
    expect(result).toBe(0);
  });
});
