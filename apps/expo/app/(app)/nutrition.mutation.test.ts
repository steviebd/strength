import { beforeEach, describe, expect, test, vi } from 'vitest';

const mutationConfigs: any[] = [];
const mockQueryClient = {
  cancelQueries: vi.fn().mockResolvedValue(undefined),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => mockQueryClient),
  useMutation: vi.fn((config) => {
    mutationConfigs.push(config);
    return {
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    };
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: { user: { id: 'user-1' } } })),
  },
}));

vi.mock('@strength/db/client', () => ({
  generateId: vi.fn(() => 'generated-id'),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/db/nutrition', () => ({
  invalidateDailySummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/offline-mutation', () => ({
  OfflineError: class OfflineError extends Error {
    constructor(message = 'Saved locally. Will sync when online.') {
      super(message);
      this.name = 'OfflineError';
    }
  },
  tryOnlineOrEnqueue: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mutationConfigs.length = 0;
});

async function setupHook() {
  const { useNutritionMutations } = await import('../../hooks/useNutritionMutations');
  useNutritionMutations({
    date: '2024-01-01',
    activeTimezone: 'America/New_York',
    dailySummaryQueryKey: ['nutrition-daily-summary', '2024-01-01', 'America/New_York'],
    refetchSummary: vi.fn(),
    clearSavedEntryFromMessages: vi.fn(),
  });
}

describe('useNutritionMutations', () => {
  test('saveMealMutation enqueues on network error', async () => {
    await setupHook();
    expect(mutationConfigs.length).toBeGreaterThanOrEqual(1);

    const { tryOnlineOrEnqueue } = await import('@/lib/offline-mutation');
    const saveConfig = mutationConfigs[0];

    await saveConfig.mutationFn({
      name: 'Oatmeal',
      mealType: 'breakfast',
      calories: 300,
      protein: 10,
      carbs: 50,
      fat: 5,
    });

    expect(tryOnlineOrEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        entityType: 'meal',
        operation: 'save_meal',
        entityId: 'generated-id',
        payload: expect.objectContaining({
          name: 'Oatmeal',
          mealType: 'breakfast',
          calories: 300,
          proteinG: 10,
          carbsG: 50,
          fatG: 5,
        }),
      }),
    );
  });

  test('deleteMealMutation does NOT roll back optimistic update on OfflineError', async () => {
    await setupHook();
    expect(mutationConfigs.length).toBeGreaterThanOrEqual(2);

    const { OfflineError } = await import('@/lib/offline-mutation');
    const deleteConfig = mutationConfigs[1];
    const offlineError = new OfflineError();

    deleteConfig.onError(offlineError, 'meal-1', { previousSummary: { entries: [] } as any });

    expect(mockQueryClient.setQueryData).not.toHaveBeenCalled();
  });

  test('deleteMealMutation rolls back optimistic update on non-offline errors', async () => {
    await setupHook();
    expect(mutationConfigs.length).toBeGreaterThanOrEqual(2);

    const deleteConfig = mutationConfigs[1];
    const previousSummary = { entries: [] } as any;

    deleteConfig.onError(new Error('Server error'), 'meal-1', { previousSummary });

    expect(mockQueryClient.setQueryData).toHaveBeenCalled();
  });
});
