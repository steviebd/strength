import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_QUERY_PARAMS,
  batchParallel,
  chunkedInsert,
  chunkedQuery,
} from './d1-batch';

describe('d1-batch constants', () => {
  it('DEFAULT_CHUNK_SIZE should be 100', () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(100);
  });

  it('DEFAULT_CONCURRENCY should be 8', () => {
    expect(DEFAULT_CONCURRENCY).toBe(8);
  });

  it('DEFAULT_MAX_QUERY_PARAMS should be 100', () => {
    expect(DEFAULT_MAX_QUERY_PARAMS).toBe(100);
  });
});

describe('batchParallel', () => {
  it('should run tasks in parallel with limited concurrency', async () => {
    let concurrentlyRunning = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      concurrentlyRunning++;
      maxConcurrent = Math.max(maxConcurrent, concurrentlyRunning);
      await new Promise((r) => setTimeout(r, 20));
      concurrentlyRunning--;
      return i;
    });

    const results = await batchParallel(tasks, 3);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(results.sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('should reject when any task rejects', async () => {
    const tasks = [
      async () => 1,
      async () => {
        throw new Error('task 2 failed');
      },
      async () => 3,
    ];

    await expect(batchParallel(tasks, 2)).rejects.toThrow('task 2 failed');
  });

  it('should handle single task', async () => {
    const results = await batchParallel([async () => 42], 1);
    expect(results).toEqual([42]);
  });

  it('should handle empty array', async () => {
    const results = await batchParallel([], 4);
    expect(results).toEqual([]);
  });
});

describe('chunkedQuery ordering', () => {
  it('should return results in same order as input ids', async () => {
    const allRows = [
      { id: 'B', name: 'second' },
      { id: 'A', name: 'first' },
      { id: 'C', name: 'third' },
    ];

    let callCount = 0;
    const builder = async (chunk: string[]): Promise<typeof allRows> => {
      callCount++;
      return allRows.filter((r) => chunk.includes(r.id));
    };

    const results = await chunkedQuery<(typeof allRows)[number]>(undefined as any, {
      ids: ['A', 'B', 'C'],
      mergeKey: 'id',
      builder,
    });

    expect(callCount).toBe(1);
    expect(results.map((r) => r.id)).toEqual(['A', 'B', 'C']);
  });

  it('should return results in input order even with out-of-order resolution', async () => {
    const allRows = [
      { id: 'C', name: 'third' },
      { id: 'A', name: 'first' },
      { id: 'B', name: 'second' },
    ];

    const builder = async (chunk: string[]): Promise<typeof allRows> => {
      return allRows.filter((r) => chunk.includes(r.id));
    };

    const results = await chunkedQuery<(typeof allRows)[number]>(undefined as any, {
      ids: ['C', 'A', 'B'],
      mergeKey: 'id',
      builder,
    });

    expect(results.map((r) => r.id)).toEqual(['C', 'A', 'B']);
  });

  it('should handle missing ids gracefully', async () => {
    const allRows = [
      { id: 'A', name: 'first' },
      { id: 'C', name: 'third' },
    ];

    const builder = async (chunk: string[]): Promise<typeof allRows> => {
      return allRows.filter((r) => chunk.includes(r.id));
    };

    const results = await chunkedQuery<(typeof allRows)[number]>(undefined as any, {
      ids: ['A', 'B', 'C'],
      mergeKey: 'id',
      builder,
    });

    expect(results.map((r) => r.id)).toEqual(['A', 'C']);
  });

  it('should return empty array for empty ids', async () => {
    let called = false;
    const builder = async (): Promise<any[]> => {
      called = true;
      return [];
    };

    const results = await chunkedQuery(undefined as any, {
      ids: [],
      mergeKey: 'id',
      builder,
    });

    expect(results).toEqual([]);
    expect(called).toBe(false);
  });

  it('should chunk large arrays and preserve order', async () => {
    const allRows = Array.from({ length: 250 }, (_, i) => ({
      id: String(i),
      name: `row-${i}`,
    }));

    let callCount = 0;
    const builder = async (chunk: string[]): Promise<typeof allRows> => {
      callCount++;
      return allRows.filter((r) => chunk.includes(r.id));
    };

    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    const results = await chunkedQuery<(typeof allRows)[number]>(undefined as any, {
      ids,
      chunkSize: 100,
      mergeKey: 'id',
      builder,
    });

    expect(callCount).toBe(3);
    expect(results.map((r) => r.id)).toEqual(ids);
  });
});

describe('chunkedInsert', () => {
  it('should reduce insert chunk size when rows are too wide for the query param budget', async () => {
    const insertedChunks: number[] = [];
    const db = {
      insert: () => ({
        values: (chunk: unknown[]) => ({
          run: async () => {
            insertedChunks.push(chunk.length);
            return { rowsAffected: chunk.length };
          },
        }),
      }),
    };

    const rows = Array.from({ length: 36 }, (_, i) => ({
      id: `row-${i}`,
      cycleId: 'cycle-1',
      templateId: null,
      weekNumber: 1,
      sessionNumber: i + 1,
      sessionName: `Session ${i + 1}`,
      targetLifts: '[]',
      isComplete: false,
      workoutId: null,
      scheduledDate: '2026-04-20',
      scheduledTime: '07:00',
    }));

    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      chunkSize: 100,
      maxQueryParams: 100,
    });

    expect(inserted).toBe(36);
    expect(insertedChunks).toEqual([6, 6, 6, 6, 6, 6]);
  });

  it('should insert chunks sequentially', async () => {
    const events: string[] = [];
    const db = {
      insert: () => ({
        values: (chunk: Array<{ id: string }>) => ({
          run: async () => {
            events.push(`start:${chunk[0].id}`);
            await new Promise((r) => setTimeout(r, chunk[0].id === 'row-0' ? 20 : 0));
            events.push(`end:${chunk[0].id}`);
            return { rowsAffected: chunk.length };
          },
        }),
      }),
    };

    await chunkedInsert(db as any, {
      table: {} as any,
      rows: [{ id: 'row-0' }, { id: 'row-1' }],
      chunkSize: 1,
      maxQueryParams: 1,
    });

    expect(events).toEqual(['start:row-0', 'end:row-0', 'start:row-1', 'end:row-1']);
  });
});
