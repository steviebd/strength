type QueueMap = Record<string, unknown[]>;

function take(queue: QueueMap, key: string, fallback?: unknown) {
  const values = queue[key];
  if (!values || values.length === 0) {
    return fallback;
  }
  return values.shift();
}

export type MockDb = ReturnType<typeof createMockDb>;

export function createMockDb(seed: QueueMap = {}) {
  const queue: QueueMap = Object.fromEntries(
    Object.entries(seed).map(([key, value]) => [key, [...value]]),
  );
  const calls = {
    values: [] as unknown[],
    sets: [] as unknown[],
    where: [] as unknown[],
  };

  const builder: any = {
    select: () => builder,
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: (...args: unknown[]) => {
      calls.where.push(args);
      return builder;
    },
    orderBy: () => builder,
    groupBy: () => builder,
    limit: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    values: (value: unknown) => {
      calls.values.push(value);
      return builder;
    },
    set: (value: unknown) => {
      calls.sets.push(value);
      return builder;
    },
    returning: () => builder,
    onConflictDoUpdate: () => builder,
    get: async () => take(queue, 'get'),
    all: async () => take(queue, 'all', []),
    run: async () => take(queue, 'run', { success: true }),
    batch: async (statements: unknown[]) => {
      calls.values.push({ batch: statements });
      return take(queue, 'batch', []);
    },
    _calls: calls,
    _queue: queue,
  };

  return builder;
}
