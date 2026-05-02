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

vi.mock('./sync-queue', () => ({
  enqueueSyncItem: vi.fn(() => 'sync-item-id'),
}));

vi.mock('@strength/db/client', () => ({
  generateId: vi.fn(() => 'test-id-123'),
}));

let mockDb: any;

function createMockDb() {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => ({ run: vi.fn() })), run: vi.fn() })),
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
          orderBy: vi.fn(() => ({
            all: vi.fn(() => []),
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            all: vi.fn(() => []),
          })),
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

describe('discardLocalWorkout', () => {
  test('soft-deletes workout, exercises, and sets', async () => {
    const exerciseRows = [{ id: 'ex-1' }, { id: 'ex-2' }];
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => exerciseRows),
        })),
      })),
    });

    const { discardLocalWorkout } = await import('./workouts');
    await discardLocalWorkout('workout-1');

    expect(mockDb.update).toHaveBeenCalledTimes(3);
    expect(mockDb.delete).not.toHaveBeenCalled();

    const setsUpdateSet = mockDb.update.mock.results[0].value.set;
    expect(setsUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true }));

    const exerciseUpdateSet = mockDb.update.mock.results[1].value.set;
    expect(exerciseUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true }));

    const workoutUpdateSet = mockDb.update.mock.results[2].value.set;
    expect(workoutUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ isDeleted: true, syncStatus: 'pending' }),
    );
  });

  test('skips sets update when no exercises exist', async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
        })),
      })),
    });

    const { discardLocalWorkout } = await import('./workouts');
    await discardLocalWorkout('workout-1');

    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});

describe('enqueueWorkoutDelete', () => {
  test('enqueues a delete_workout sync item', async () => {
    const { enqueueSyncItem } = await import('./sync-queue');
    const { enqueueWorkoutDelete } = await import('./workouts');
    const id = await enqueueWorkoutDelete('user-1', 'workout-1');

    expect(id).toBe('sync-item-id');
    expect(enqueueSyncItem).toHaveBeenCalledWith(
      'user-1',
      'workout',
      'workout-1',
      'delete_workout',
      {},
    );
  });
});
