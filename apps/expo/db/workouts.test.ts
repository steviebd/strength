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
  WORKOUT_TYPE_TRAINING: 'training',
  WORKOUT_TYPE_ONE_RM_TEST: 'one_rm_test',
  exerciseLibrary: [],
  generateId: vi.fn(() => 'test-id-123'),
}));

vi.mock('../lib/storage', () => ({
  removePendingWorkout: vi.fn(),
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
          all: vi.fn(() => []),
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

describe('template exercise normalization', () => {
  test('preserves type-specific template fields for local cache and workout start', async () => {
    const { normalizeTemplateExerciseForLocalCache, normalizeTemplateExerciseForWorkoutStart } =
      await import('./workouts');

    const treadmill = {
      id: 'template-exercise-1',
      exerciseId: 'exercise-1',
      name: 'Treadmill',
      muscleGroup: 'Cardio',
      exerciseType: 'cardio',
      orderIndex: 2,
      targetDuration: 1800,
      targetDistance: 5000,
      sets: 1,
      reps: null,
      isAmrap: true,
    };

    expect(normalizeTemplateExerciseForLocalCache('template-1', treadmill)).toEqual(
      expect.objectContaining({
        templateId: 'template-1',
        exerciseType: 'cardio',
        targetDuration: 1800,
        targetDistance: 5000,
      }),
    );
    expect(normalizeTemplateExerciseForWorkoutStart(treadmill, 0)).toEqual(
      expect.objectContaining({
        exerciseType: 'cardio',
        targetDuration: 1800,
        targetDistance: 5000,
        orderIndex: 2,
      }),
    );
  });
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
      expect.objectContaining({ isDeleted: true, syncStatus: 'local' }),
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

describe('createLocalWorkout', () => {
  test('regenerates duplicate zero IDs before inserting local exercise rows', async () => {
    const { createLocalWorkout } = await import('./workouts');

    await createLocalWorkout('user-1', {
      name: 'Workout',
      exercises: [
        {
          id: '00000000-0000-4000-8000-000000000000',
          exerciseId: 'exercise-1',
          name: 'Squat',
          orderIndex: 0,
          sets: [
            {
              id: '00000000-0000-4000-8000-000000000000',
              setNumber: 1,
            },
            {
              id: '00000000-0000-4000-8000-000000000000',
              setNumber: 2,
            },
          ],
        },
      ],
    });

    const insertedValues = mockDb.insert.mock.results.map((result: any) => {
      const values = result.value.values as ReturnType<typeof vi.fn>;
      return values.mock.calls[0][0];
    });
    const setRows = insertedValues.filter((row: any) => row.workoutExerciseId);

    expect(setRows.map((row: any) => row.id)).toEqual(['test-id-123', 'test-id-123-11']);
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
