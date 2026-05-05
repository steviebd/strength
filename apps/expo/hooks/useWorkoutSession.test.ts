import { beforeEach, describe, expect, test, vi } from 'vitest';

(globalThis as any).__DEV__ = false;

let stateIndex = 0;
const stateValues: unknown[] = [];
const effectCleanups: (() => void)[] = [];

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: <T>(initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] => {
      const idx = stateIndex++;
      if (stateValues[idx] === undefined) {
        stateValues[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setter = (value: T | ((prev: T) => T)) => {
        stateValues[idx] =
          typeof value === 'function' ? (value as (prev: T) => T)(stateValues[idx] as T) : value;
      };
      return [stateValues[idx] as T, setter];
    },
    useEffect: (effect: () => void | (() => void), _deps?: unknown[]) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        effectCleanups.push(cleanup);
      }
    },
    useRef: <T>(initial: T) => ({ current: initial }),
    useCallback: (fn: any, _deps?: unknown[]) => fn,
  };
});

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: { user: { id: 'user-1' } } })),
  },
}));

vi.mock('@/context/UserPreferencesContext', () => ({
  useUserPreferences: vi.fn(() => ({ weightUnit: 'kg' })),
}));

vi.mock('@/db/workouts', () => ({
  completeLocalWorkout: vi.fn(),
  createLocalWorkout: vi.fn(),
  discardLocalWorkout: vi.fn(),
  enqueueWorkoutDelete: vi.fn(),
  getLocalLastCompletedExerciseSnapshots: vi.fn(),
  getLocalWorkout: vi.fn(),
  markLocalCycleWorkoutComplete: vi.fn(),
  saveLocalWorkoutDraft: vi.fn(),
}));

vi.mock('@/db/sync-queue', () => ({
  enqueueWorkoutCompletion: vi.fn(),
}));

vi.mock('@/lib/workout-sync', () => ({
  runWorkoutSync: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  removePendingWorkout: vi.fn(),
}));

vi.mock('@/db/last-workouts', () => ({
  getLastWorkout: vi.fn(),
  setLastWorkout: vi.fn(),
}));

vi.mock('@strength/db/client', () => ({
  generateId: vi.fn(() => 'generated-id'),
  exerciseLibrary: [],
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  stateIndex = 0;
  stateValues.length = 0;
  effectCleanups.length = 0;
  vi.clearAllMocks();
});

describe('useWorkoutSession', () => {
  test('discardWorkout only discards local in-progress state', async () => {
    stateValues[0] = {
      id: 'workout-1',
      name: 'Test Workout',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T01:00:00Z',
      notes: null,
      exercises: [],
    };

    const { useWorkoutSession } = await import('./useWorkoutSession');
    const result = useWorkoutSession();

    await result.discardWorkout();

    const { discardLocalWorkout } = await import('@/db/workouts');
    const { removePendingWorkout } = await import('@/lib/storage');

    expect(discardLocalWorkout).toHaveBeenCalledWith('workout-1', undefined);
    expect(removePendingWorkout).toHaveBeenCalledWith('workout-1');
  });
});
