import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchCycles, fetchRecoveries, fetchSleep, fetchWorkouts } from './api';

const collectionFetchers = [
  ['activity/workout', fetchWorkouts],
  ['recovery', fetchRecoveries],
  ['cycle', fetchCycles],
  ['activity/sleep', fetchSleep],
] as const;

describe('WHOOP API collections', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(collectionFetchers)(
    'requests %s pages with WHOOP max page size',
    async (_, fetcher) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await fetcher('access-token');

      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.get('limit')).toBe('25');
    },
  );

  test('preserves start and paginates with next token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [{ id: 'workout-1' }], next_token: 'next-page' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [{ id: 'workout-2' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(
      fetchWorkouts('access-token', new Date('2026-04-01T00:00:00.000Z')),
    ).resolves.toEqual([{ id: 'workout-1' }, { id: 'workout-2' }]);

    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));

    expect(firstUrl.searchParams.get('start')).toBe('2026-04-01T00:00:00.000Z');
    expect(firstUrl.searchParams.get('limit')).toBe('25');
    expect(secondUrl.searchParams.get('nextToken')).toBe('next-page');
    expect(secondUrl.searchParams.get('limit')).toBe('25');
  });
});
