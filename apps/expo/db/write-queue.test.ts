import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  cancelCoalescedLocalWrite,
  enqueueCoalescedLocalWrite,
  enqueueLocalWrite,
  flushLocalWrites,
} from './write-queue';

beforeEach(async () => {
  vi.useFakeTimers();
  await flushLocalWrites();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('local write queue', () => {
  test('runs writes serially', async () => {
    const order: string[] = [];
    const first = enqueueLocalWrite(async () => {
      order.push('first:start');
      await Promise.resolve();
      order.push('first:end');
    });
    const second = enqueueLocalWrite(() => {
      order.push('second');
    });

    await first;
    await second;

    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  test('coalesces writes by key', async () => {
    const first = vi.fn();
    const second = vi.fn();

    const firstWrite = enqueueCoalescedLocalWrite('draft-1', first, 1500);
    const secondWrite = enqueueCoalescedLocalWrite('draft-1', second, 1500);
    await vi.advanceTimersByTimeAsync(1500);
    await Promise.all([firstWrite, secondWrite]);
    await flushLocalWrites();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('can cancel a coalesced write', async () => {
    const task = vi.fn();

    void enqueueCoalescedLocalWrite('draft-1', task, 1500);
    cancelCoalescedLocalWrite('draft-1');
    await vi.advanceTimersByTimeAsync(1500);
    await flushLocalWrites();

    expect(task).not.toHaveBeenCalled();
  });
});
