import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core/table';

type DbClient = DrizzleD1Database<Record<string, unknown>>;

export const DEFAULT_CHUNK_SIZE = 100;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_MAX_QUERY_PARAMS = 100;
export const DEFAULT_STATEMENTS_PER_BATCH = 95;

export async function batchParallel<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<T[]> {
  if (tasks.length === 0) return [];

  const results = Array.from<T>({ length: tasks.length });
  let completed = 0;
  let index = 0;

  return new Promise<T[]>((resolve, reject) => {
    const runNext = (): void => {
      if (index >= tasks.length) return;
      const i = index++;
      tasks[i]()
        .then((value) => {
          results[i] = value;
          completed++;
          if (completed === tasks.length) {
            resolve(results);
          } else {
            runNext();
          }
        })
        .catch(reject);
    };

    for (let j = 0; j < Math.min(concurrency, tasks.length); j++) {
      runNext();
    }
  });
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function getSafeInsertChunkSize(
  rows: Record<string, unknown>[],
  chunkSize: number,
  maxQueryParams: number,
): number {
  const generatedColumnHeadroom = 4;
  const definedColumns = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined) {
        definedColumns.add(key);
      }
    }
  }

  if (definedColumns.size === 0) {
    return chunkSize;
  }

  const estimatedParamsPerRow = definedColumns.size + generatedColumnHeadroom;
  return Math.max(1, Math.min(chunkSize, Math.floor(maxQueryParams / estimatedParamsPerRow)));
}

export async function chunkedQuery<T>(
  db: DbClient,
  config: {
    ids: string[];
    chunkSize?: number;
    mergeKey: keyof T;
    builder: (chunk: string[]) => Promise<T[]>;
  },
): Promise<T[]> {
  const { ids, chunkSize = DEFAULT_CHUNK_SIZE, mergeKey, builder } = config;

  if (ids.length === 0) return [];

  const chunks = chunkArray(ids, chunkSize);
  const tasks = chunks.map((chunk) => () => builder(chunk));
  const results = await batchParallel(tasks);

  const flat = results.flat();

  const byId = new Map<unknown, T>();
  for (const row of flat) {
    byId.set(row[mergeKey], row);
  }

  const ordered: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }

  return ordered;
}

export async function chunkedQueryMany<T>(
  db: DbClient,
  config: {
    ids: string[];
    chunkSize?: number;
    builder: (chunk: string[]) => Promise<T[]>;
  },
): Promise<T[]> {
  const { ids, chunkSize = DEFAULT_CHUNK_SIZE, builder } = config;

  if (ids.length === 0) return [];

  const chunks = chunkArray(ids, chunkSize);
  const tasks = chunks.map((chunk) => () => builder(chunk));
  const results = await batchParallel(tasks);
  return results.flat();
}

export async function chunkedInsert<T extends AnySQLiteTable>(
  db: DbClient,
  config: {
    table: T;
    rows: T['$inferInsert'][];
    chunkSize?: number;
    maxQueryParams?: number;
  },
): Promise<number> {
  const {
    table,
    rows,
    chunkSize = DEFAULT_CHUNK_SIZE,
    maxQueryParams = DEFAULT_MAX_QUERY_PARAMS,
  } = config;

  if (rows.length === 0) return 0;

  const safeChunkSize = getSafeInsertChunkSize(
    rows as Record<string, unknown>[],
    chunkSize,
    maxQueryParams,
  );
  const chunks = chunkArray(rows, safeChunkSize);

  const STATEMENTS_PER_BATCH = DEFAULT_STATEMENTS_PER_BATCH;
  let insertedRows = 0;

  for (let i = 0; i < chunks.length; i += STATEMENTS_PER_BATCH) {
    const batchChunks = chunks.slice(i, i + STATEMENTS_PER_BATCH);
    const statements = batchChunks.map((chunk) => db.insert(table).values(chunk));
    const results = await db.batch(statements as any);
    insertedRows += results.reduce((sum, r) => sum + r.rowsAffected, 0);
  }

  return insertedRows;
}
