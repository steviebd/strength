type LocalWriteTask<T> = () => Promise<T> | T;

let tail: Promise<unknown> = Promise.resolve();

const coalescedTasks = new Map<string, () => Promise<unknown>>();
const coalescedTimers = new Map<string, ReturnType<typeof setTimeout>>();
const coalescedResolvers = new Map<string, Array<() => void>>();

export function enqueueLocalWrite<T>(task: LocalWriteTask<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => {});
  return run;
}

export function enqueueCoalescedLocalWrite<T>(
  key: string,
  task: LocalWriteTask<T>,
  delayMs: number,
): Promise<void> {
  coalescedTasks.set(key, async () => {
    await task();
  });

  const existingTimer = coalescedTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  return new Promise((resolve) => {
    const resolvers = coalescedResolvers.get(key) ?? [];
    resolvers.push(resolve);
    coalescedResolvers.set(key, resolvers);

    const timer = setTimeout(() => {
      coalescedTimers.delete(key);
      const latest = coalescedTasks.get(key);
      coalescedTasks.delete(key);
      const pendingResolvers = coalescedResolvers.get(key) ?? [];
      coalescedResolvers.delete(key);
      const resolveAll = () => {
        for (const pendingResolve of pendingResolvers) {
          pendingResolve();
        }
      };
      if (!latest) {
        resolveAll();
        return;
      }
      void enqueueLocalWrite(latest).finally(resolveAll);
    }, delayMs);
    coalescedTimers.set(key, timer);
  });
}

export async function flushLocalWrites() {
  for (const [key, timer] of coalescedTimers) {
    clearTimeout(timer);
    coalescedTimers.delete(key);
    const latest = coalescedTasks.get(key);
    coalescedTasks.delete(key);
    const pendingResolvers = coalescedResolvers.get(key) ?? [];
    coalescedResolvers.delete(key);
    if (latest) {
      await enqueueLocalWrite(latest);
    }
    for (const resolve of pendingResolvers) {
      resolve();
    }
  }
  await tail;
}

export function cancelCoalescedLocalWrite(key: string) {
  const timer = coalescedTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    coalescedTimers.delete(key);
  }
  coalescedTasks.delete(key);
  const pendingResolvers = coalescedResolvers.get(key) ?? [];
  coalescedResolvers.delete(key);
  for (const resolve of pendingResolvers) {
    resolve();
  }
}
