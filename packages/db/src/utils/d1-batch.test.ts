import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_QUERY_PARAMS,
  DEFAULT_STATEMENTS_PER_BATCH,
  batchParallel,
  chunkedInsert,
  chunkedQuery,
  chunkedQueryMany,
} from './d1-batch';

describe('d1-batch constants', () => {
  it('DEFAULT_CHUNK_SIZE should be 100', () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(100);
  });

  it('DEFAULT_CONCURRENCY should be 4', () => {
    expect(DEFAULT_CONCURRENCY).toBe(4);
  });

  it('DEFAULT_MAX_QUERY_PARAMS should be 100', () => {
    expect(DEFAULT_MAX_QUERY_PARAMS).toBe(100);
  });

  it('DEFAULT_STATEMENTS_PER_BATCH should be 45', () => {
    expect(DEFAULT_STATEMENTS_PER_BATCH).toBe(45);
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

describe('chunkedQueryMany', () => {
  it('should return all rows without deduplicating by merge key', async () => {
    const allRows = [
      { workoutExerciseId: 'A', setNumber: 1 },
      { workoutExerciseId: 'A', setNumber: 2 },
      { workoutExerciseId: 'A', setNumber: 3 },
      { workoutExerciseId: 'B', setNumber: 1 },
    ];

    const builder = async (chunk: string[]) => {
      return allRows.filter((r) => chunk.includes(r.workoutExerciseId));
    };

    const results = await chunkedQueryMany<(typeof allRows)[number]>(undefined as any, {
      ids: ['A', 'B'],
      builder,
    });

    expect(results).toHaveLength(4);
    expect(results.map((r) => r.setNumber)).toEqual([1, 2, 3, 1]);
  });

  it('should chunk large arrays and preserve all rows', async () => {
    const allRows = Array.from({ length: 250 }, (_, i) => ({
      templateId: String(Math.floor(i / 3)),
      orderIndex: i,
    }));

    let callCount = 0;
    const builder = async (chunk: string[]) => {
      callCount++;
      return allRows.filter((r) => chunk.includes(r.templateId));
    };

    const ids = Array.from({ length: 100 }, (_, i) => String(i));
    const results = await chunkedQueryMany<(typeof allRows)[number]>(undefined as any, {
      ids,
      chunkSize: 50,
      builder,
    });

    expect(callCount).toBe(2);
    expect(results).toHaveLength(allRows.filter((r) => ids.includes(r.templateId)).length);
  });

  it('should return empty array for empty ids', async () => {
    let called = false;
    const builder = async (): Promise<any[]> => {
      called = true;
      return [];
    };

    const results = await chunkedQueryMany(undefined as any, {
      ids: [],
      builder,
    });

    expect(results).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('chunkedInsert', () => {
  it('should return 0 for empty rows', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          _prepare: () => ({ getQuery: () => ({ sql: '', params: [] }) }),
        }),
      }),
      batch: async () => {
        throw new Error('batch should not be called');
      },
    };

    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows: [],
      chunkSize: 100,
    });

    expect(inserted).toBe(0);
  });

  it('should call db.batch with correct statement counts for large inserts', async () => {
    const batchCalls: unknown[][][] = [];
    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => ({
          prepare: () => ({
            getQuery: () => ({ sql: '?', params: [] }),
          }),
        }),
      }),
      batch: async (statements: unknown[][]) => {
        batchCalls.push(statements);
        return statements.map(() => ({ rowsAffected: 1 }));
      },
    };

    const rows = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }));
    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      chunkSize: 1,
    });

    expect(batchCalls.length).toBe(6);
    expect(batchCalls[0].length).toBe(45);
    expect(batchCalls[1].length).toBe(45);
    expect(batchCalls[2].length).toBe(45);
    expect(batchCalls[3].length).toBe(45);
    expect(batchCalls[4].length).toBe(45);
    expect(batchCalls[5].length).toBe(25);
    expect(inserted).toBe(250);
  });

  it('should allow callers to override statements per batch', async () => {
    const batchCalls: unknown[][][] = [];
    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => ({
          prepare: () => ({
            getQuery: () => ({ sql: '?', params: [] }),
          }),
        }),
      }),
      batch: async (statements: unknown[][]) => {
        batchCalls.push(statements);
        return statements.map(() => ({ rowsAffected: 1 }));
      },
    };

    const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i) }));
    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      chunkSize: 1,
      maxStatementsPerBatch: 10,
    });

    expect(batchCalls.map((batch) => batch.length)).toEqual([10, 10, 5]);
    expect(inserted).toBe(25);
  });

  it('should reject invalid maxStatementsPerBatch values', async () => {
    await expect(
      chunkedInsert({} as any, {
        table: {} as any,
        rows: [{ id: 'a' }],
        maxStatementsPerBatch: 0,
      }),
    ).rejects.toThrow('maxStatementsPerBatch must be at least 1');
  });

  it('should call db.batch once for small inserts', async () => {
    let batchCalled = false;
    let receivedStatements: unknown[][] = [];
    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => ({
          prepare: () => ({
            getQuery: () => ({ sql: '?', params: [] }),
          }),
        }),
      }),
      batch: async (statements: unknown[][]) => {
        batchCalled = true;
        receivedStatements = statements;
        return statements.map(() => ({ rowsAffected: 1 }));
      },
    };

    const rows = [{ id: 'a' }, { id: 'b' }];
    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      chunkSize: 100,
    });

    expect(batchCalled).toBe(true);
    expect(receivedStatements.length).toBe(1);
    expect(inserted).toBe(1);
  });

  it('should read D1 rows affected from meta changes', async () => {
    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => ({
          prepare: () => ({
            getQuery: () => ({ sql: '?', params: [] }),
          }),
        }),
      }),
      batch: async () => [{ success: true, meta: { changes: 2 } }],
    };

    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows: [{ id: 'a' }, { id: 'b' }],
      chunkSize: 100,
    });

    expect(inserted).toBe(2);
  });

  it('should treat missing row counts as zero', async () => {
    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => ({
          prepare: () => ({
            getQuery: () => ({ sql: '?', params: [] }),
          }),
        }),
      }),
      batch: async () => [{ success: true }],
    };

    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows: [{ id: 'a' }],
    });

    expect(inserted).toBe(0);
  });

  it('should reduce insert chunk size when rows are too wide for the query param budget', async () => {
    const batchCalls: unknown[][][] = [];
    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => ({
          prepare: () => ({
            getQuery: () => ({ sql: '?', params: [] }),
          }),
        }),
      }),
      batch: async (statements: unknown[][]) => {
        batchCalls.push(statements);
        return statements.map(() => ({ rowsAffected: statements.length }));
      },
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
      scheduledAt: new Date('2026-04-20T07:00:00').getTime(),
    }));

    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      chunkSize: 100,
      maxQueryParams: 100,
    });

    expect(inserted).toBe(36);
    expect(batchCalls.length).toBe(1);
    expect(batchCalls[0].length).toBe(6);
  });

  it('should return 0 for empty rows with onConflictDoUpdate', async () => {
    const inserted = await chunkedInsert(undefined as any, {
      table: {} as any,
      rows: [],
      onConflictDoUpdate: {
        target: 'id',
        set: { id: 'excluded.id' as any },
      },
    });

    expect(inserted).toBe(0);
  });
});

describe('chunkedInsert with onConflictDoUpdate', () => {
  it('should call onConflictDoUpdate on each statement when config is provided', async () => {
    let onConflictCalls = 0;
    let receivedConfigs: any[] = [];

    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => {
          const base = {
            prepare: () => ({
              getQuery: () => ({ sql: '?', params: [] }),
            }),
          };
          return {
            ...base,
            onConflictDoUpdate: (config: any) => {
              onConflictCalls++;
              receivedConfigs.push(config);
              return base;
            },
          };
        },
      }),
      batch: async (statements: unknown[][]) => {
        return statements.map(() => ({ rowsAffected: 1 }));
      },
    };

    const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }));
    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      chunkSize: 25,
      maxQueryParams: 9999,
      onConflictDoUpdate: {
        target: 'my_column',
        set: { col: 'excluded.col' as any },
      },
    });

    expect(onConflictCalls).toBe(2);
    expect(inserted).toBe(2);
    expect(receivedConfigs[0].target).toBe('my_column');
    expect(receivedConfigs[1].target).toBe('my_column');
  });

  it('should batch upsert statements correctly', async () => {
    const batchCalls: unknown[][][] = [];
    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => {
          const base = {
            prepare: () => ({
              getQuery: () => ({ sql: '?', params: [] }),
            }),
          };
          return {
            ...base,
            onConflictDoUpdate: (_config: any) => base,
          };
        },
      }),
      batch: async (statements: unknown[][]) => {
        batchCalls.push(statements);
        return statements.map(() => ({ rowsAffected: 1 }));
      },
    };

    const rows = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }));
    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      chunkSize: 1,
      maxStatementsPerBatch: 45,
      onConflictDoUpdate: {
        target: 'id',
        set: { id: 'excluded.id' as any },
      },
    });

    expect(inserted).toBe(250);
    expect(batchCalls.length).toBe(6);
    expect(batchCalls[0].length).toBe(45);
    expect(batchCalls[5].length).toBe(25);
  });

  it('should work with single-chunk upsert', async () => {
    let onConflictCalled = false;

    const db = {
      insert: () => ({
        values: (_chunk: unknown[]) => {
          const base = {
            prepare: () => ({
              getQuery: () => ({ sql: '?', params: [] }),
            }),
          };
          return {
            ...base,
            onConflictDoUpdate: (_config: any) => {
              onConflictCalled = true;
              return base;
            },
          };
        },
      }),
      batch: async (statements: unknown[][]) => {
        return statements.map(() => ({ rowsAffected: 2 }));
      },
    };

    const rows = [{ id: 'a' }, { id: 'b' }];
    const inserted = await chunkedInsert(db as any, {
      table: {} as any,
      rows,
      onConflictDoUpdate: {
        target: 'id',
        set: { id: 'excluded.id' as any },
      },
    });

    expect(onConflictCalled).toBe(true);
    expect(inserted).toBe(2);
  });
});
