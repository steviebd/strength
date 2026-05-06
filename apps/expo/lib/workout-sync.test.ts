import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteSyncItem, getRunnableSyncItems, markSyncItemStatus } from '@/db/sync-queue';

const apiFetchMock = vi.hoisted(() => vi.fn());
const hydrateOfflineTrainingSnapshotMock = vi.hoisted(() => vi.fn());
const getLocalDbMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.status = status;
      (this as any).details = details;
    }
  },
  apiFetch: apiFetchMock,
}));

vi.mock('@/db/training-cache', () => ({
  hydrateOfflineTrainingSnapshot: hydrateOfflineTrainingSnapshotMock,
}));

vi.mock('@/db/client', () => ({
  getLocalDb: getLocalDbMock,
}));

vi.mock('@/db/local-schema', () => ({
  localTrainingCacheMeta: {},
}));

vi.mock('@/db/workouts', () => ({
  buildWorkoutCompletionPayload: vi.fn(),
  markWorkoutConflict: vi.fn(),
  markWorkoutFailed: vi.fn(),
  markWorkoutSynced: vi.fn(),
  markWorkoutSyncing: vi.fn(),
  upsertServerWorkoutSnapshot: vi.fn(),
}));

vi.mock('@/db/sync-queue', () => ({
  deleteSyncItem: vi.fn(),
  getRunnableSyncItems: vi.fn(() => Promise.resolve([])),
  markSyncItemStatus: vi.fn(),
  resetWorkoutSyncItems: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  removePendingWorkout: vi.fn(),
}));

vi.mock('@/db/local-cleanup', () => ({
  cleanupStaleLocalData: vi.fn(),
}));

vi.mock('@/db/body-stats', () => ({
  hydrateBodyweightHistory: vi.fn(),
}));

function createMockDb(row: { hydratedAt: Date } | undefined) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => row),
        })),
      })),
    })),
  };
}

describe('hydrateTrainingCache', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    hydrateOfflineTrainingSnapshotMock.mockReset();
    getLocalDbMock.mockReset();
    vi.clearAllMocks();
    vi.resetModules();
  });

  test('is skipped when last hydration was within 10 seconds', async () => {
    const userId = 'user-1';
    const recent = new Date(Date.now() - 5_000);
    getLocalDbMock.mockReturnValue(createMockDb({ hydratedAt: recent }));

    const { hydrateTrainingCache } = await import('./workout-sync');
    await hydrateTrainingCache(userId);

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(hydrateOfflineTrainingSnapshotMock).not.toHaveBeenCalled();
  });

  test('runs when last hydration was > 10 seconds ago', async () => {
    const userId = 'user-1';
    const old = new Date(Date.now() - 15_000);
    getLocalDbMock.mockReturnValue(createMockDb({ hydratedAt: old }));
    apiFetchMock.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      templates: [],
      userExercises: [],
      activeProgramCycles: [],
      recentWorkouts: [],
    });

    const { hydrateTrainingCache } = await import('./workout-sync');
    await hydrateTrainingCache(userId);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/training/offline-snapshot');
    expect(hydrateOfflineTrainingSnapshotMock).toHaveBeenCalledWith(userId, expect.any(Object));
  });

  test('runs regardless of cooldown when force: true', async () => {
    const userId = 'user-1';
    const recent = new Date(Date.now() - 5_000);
    getLocalDbMock.mockReturnValue(createMockDb({ hydratedAt: recent }));
    apiFetchMock.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      templates: [],
      userExercises: [],
      activeProgramCycles: [],
      recentWorkouts: [],
    });

    const { hydrateTrainingCache } = await import('./workout-sync');
    await hydrateTrainingCache(userId, { force: true });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/training/offline-snapshot');
    expect(hydrateOfflineTrainingSnapshotMock).toHaveBeenCalledWith(userId, expect.any(Object));
  });
});

describe('runSyncQueue', () => {
  const mockedGetRunnableSyncItems = vi.mocked(getRunnableSyncItems);

  beforeEach(() => {
    apiFetchMock.mockReset();
    vi.clearAllMocks();
    vi.resetModules();
    mockedGetRunnableSyncItems.mockResolvedValue([]);
  });

  test('processes delete_workout via generic handler', async () => {
    mockedGetRunnableSyncItems.mockResolvedValue([
      {
        id: 'item-1',
        userId: 'user-1',
        entityType: 'workout',
        entityId: 'workout-1',
        operation: 'delete_workout',
        payloadJson: '{}',
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        availableAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    apiFetchMock.mockResolvedValue({});

    const { runSyncQueue } = await import('./workout-sync');
    await runSyncQueue('user-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/workouts/workout-1', {
      method: 'DELETE',
      body: undefined,
    });
    expect(markSyncItemStatus).toHaveBeenCalledWith('item-1', 'done');
    expect(deleteSyncItem).toHaveBeenCalledWith('item-1');
  });

  test('processes start_program via the program creation endpoint', async () => {
    mockedGetRunnableSyncItems.mockResolvedValue([
      {
        id: 'item-program',
        userId: 'user-1',
        entityType: 'program',
        entityId: 'program-1',
        operation: 'start_program',
        payloadJson: '{"programSlug":"stronglifts-5x5","name":"StrongLifts 5x5"}',
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        availableAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    apiFetchMock.mockResolvedValue({ id: 'cycle-1' });

    const { runSyncQueue } = await import('./workout-sync');
    await runSyncQueue('user-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/programs', {
      method: 'POST',
      body: { programSlug: 'stronglifts-5x5', name: 'StrongLifts 5x5' },
    });
    expect(markSyncItemStatus).toHaveBeenCalledWith('item-program', 'done');
    expect(deleteSyncItem).toHaveBeenCalledWith('item-program');
  });

  test('marks generic operation as conflict on 4xx', async () => {
    mockedGetRunnableSyncItems.mockResolvedValue([
      {
        id: 'item-2',
        userId: 'user-1',
        entityType: 'meal',
        entityId: 'meal-1',
        operation: 'save_meal',
        payloadJson: '{"name":"lunch"}',
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        availableAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    apiFetchMock.mockRejectedValue(
      new (await import('@/lib/api')).ApiError('Bad Request', 400, null),
    );

    const { runSyncQueue } = await import('./workout-sync');
    await runSyncQueue('user-1');

    expect(markSyncItemStatus).toHaveBeenCalledWith('item-2', 'conflict', {
      error: 'Bad Request',
    });
  });

  test('marks generic operation as failed on 5xx', async () => {
    mockedGetRunnableSyncItems.mockResolvedValue([
      {
        id: 'item-3',
        userId: 'user-1',
        entityType: 'template',
        entityId: 'template-1',
        operation: 'save_template',
        payloadJson: '{"name":"Push"}',
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        availableAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    apiFetchMock.mockRejectedValue(
      new (await import('@/lib/api')).ApiError('Server Error', 500, null),
    );

    const { runSyncQueue } = await import('./workout-sync');
    await runSyncQueue('user-1');

    expect(markSyncItemStatus).toHaveBeenCalledWith('item-3', 'failed', {
      error: 'Server Error',
    });
  });

  test('runWorkoutSync still works as deprecated alias', async () => {
    mockedGetRunnableSyncItems.mockResolvedValue([
      {
        id: 'item-4',
        userId: 'user-1',
        entityType: 'workout',
        entityId: 'workout-1',
        operation: 'delete_workout',
        payloadJson: '{}',
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        availableAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    apiFetchMock.mockResolvedValue({});

    const { runWorkoutSync } = await import('./workout-sync');
    await runWorkoutSync('user-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/workouts/workout-1', {
      method: 'DELETE',
      body: undefined,
    });
    expect(markSyncItemStatus).toHaveBeenCalledWith('item-4', 'done');
    expect(deleteSyncItem).toHaveBeenCalledWith('item-4');
  });
});
