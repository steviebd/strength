import { beforeEach, describe, expect, test, vi } from 'vitest';

const sqlite = {
  withTransactionSync: vi.fn((fn: () => void) => fn()),
};

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: vi.fn(() => sqlite),
}));

vi.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock('./migrations', () => ({
  runLocalMigrations: vi.fn(),
}));

vi.mock('@strength/db/client', () => ({
  generateId: vi.fn(() => 'test-id-123'),
}));

let mockDb: any;

function createMockDb() {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: vi.fn() })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ run: vi.fn() })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ run: vi.fn() })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            all: vi.fn(() => []),
          })),
          get: vi.fn(() => undefined),
        })),
      })),
    })),
  };
}

beforeEach(() => {
  vi.resetModules();
  mockDb = createMockDb();
  vi.clearAllMocks();
});

describe('enqueueSyncItem', () => {
  test('inserts a generic sync item into local_sync_queue', async () => {
    const { enqueueSyncItem } = await import('./sync-queue');
    const id = await enqueueSyncItem('user-1', 'meal', 'meal-1', 'save_meal', { name: 'lunch' });

    expect(id).toBe('test-id-123');
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const valuesFn = mockDb.insert.mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id-123',
        userId: 'user-1',
        entityType: 'meal',
        entityId: 'meal-1',
        operation: 'save_meal',
        payloadJson: JSON.stringify({ name: 'lunch' }),
        status: 'pending',
        attemptCount: 0,
      }),
    );
  });

  test('returns null when db is unavailable', async () => {
    vi.mocked((await import('drizzle-orm/expo-sqlite')).drizzle).mockReturnValueOnce(null as any);
    const { enqueueSyncItem } = await import('./sync-queue');
    const id = await enqueueSyncItem('user-1', 'meal', 'meal-1', 'save_meal', {});
    expect(id).toBeNull();
  });
});

describe('enqueueWorkoutCompletion', () => {
  test('delegates to enqueueSyncItem with workout-specific args', async () => {
    const { enqueueWorkoutCompletion } = await import('./sync-queue');
    const id = await enqueueWorkoutCompletion('user-1', 'workout-1', { duration: 30 });

    expect(id).toBe('test-id-123');
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const valuesFn = mockDb.insert.mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout',
        entityId: 'workout-1',
        operation: 'complete_workout',
      }),
    );
  });
});

describe('getPendingSyncItemCount', () => {
  test('returns count from db', async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => ({ count: 5 })),
        })),
      })),
    });

    const { getPendingSyncItemCount } = await import('./sync-queue');
    const count = await getPendingSyncItemCount('user-1');
    expect(count).toBe(5);
  });

  test('returns 0 when db is unavailable', async () => {
    vi.mocked((await import('drizzle-orm/expo-sqlite')).drizzle).mockReturnValueOnce(null as any);
    const { getPendingSyncItemCount } = await import('./sync-queue');
    const count = await getPendingSyncItemCount('user-1');
    expect(count).toBe(0);
  });
});

describe('resetSyncItems', () => {
  test('updates failed/conflict items for the given entityId', async () => {
    const { resetSyncItems } = await import('./sync-queue');
    await resetSyncItems('entity-1');

    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

describe('resetWorkoutSyncItems', () => {
  test('delegates to resetSyncItems', async () => {
    const { resetWorkoutSyncItems } = await import('./sync-queue');
    await resetWorkoutSyncItems('workout-1');

    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});
