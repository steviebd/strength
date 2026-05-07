import { flushLocalWrites } from './write-queue';

type LocalReadTask<T> = () => Promise<T> | T;

let readTail: Promise<unknown> = Promise.resolve();

export function enqueueLocalRead<T>(task: LocalReadTask<T>): Promise<T> {
  const run = readTail.then(async () => {
    await flushLocalWrites();
    return task();
  });
  readTail = run.catch(() => {});
  return run;
}
