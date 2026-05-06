import { beforeEach, describe, expect, test, vi } from 'vitest';

const invalidateQueriesMock = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((options: any) => ({
    mutateAsync: vi.fn((vars: any) => options.mutationFn(vars)),
    mutate: vi.fn((vars: any) => options.mutationFn(vars).catch(() => {})),
    isPending: false,
    error: null,
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: invalidateQueriesMock,
  })),
  useQuery: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: { user: { id: 'user-1' } },
      isPending: false,
    })),
  },
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/offline-mutation', () => ({
  OfflineError: class OfflineError extends Error {
    constructor(message = 'Saved locally. Will sync when online.') {
      super(message);
      this.name = 'OfflineError';
    }
  },
  tryOnlineOrEnqueue: vi.fn((options) => options.apiCall()),
}));

vi.mock('@/db/client', () => ({
  getLocalDb: vi.fn(() => ({
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })),
    })),
  })),
}));

vi.mock('@/db/local-schema', () => ({
  localTemplates: {},
  localSyncQueue: {},
}));

vi.mock('@strength/db/client', () => ({
  WORKOUT_TYPE_TRAINING: 'training',
  WORKOUT_TYPE_ONE_RM_TEST: 'one_rm_test',
  generateId: vi.fn(() => 'generated-id'),
}));

vi.mock('@/db/workouts', () => ({
  cacheTemplates: vi.fn(),
}));

vi.mock('@/db/training-cache', () => ({
  getCachedTemplates: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./useOfflineQuery', () => ({
  useOfflineQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

import { tryOnlineOrEnqueue, OfflineError } from '@/lib/offline-mutation';

beforeEach(() => {
  vi.clearAllMocks();
  invalidateQueriesMock.mockClear();
});

describe('useTemplates', () => {
  test('createTemplate wraps apiCall with tryOnlineOrEnqueue', async () => {
    const { useTemplates } = await import('./useTemplates');
    const { createTemplate } = useTemplates();
    await createTemplate.mutateAsync({ name: 'Test' });

    expect(tryOnlineOrEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        entityType: 'template',
        operation: 'create_template',
        entityId: 'generated-id',
        payload: { id: 'generated-id', name: 'Test' },
      }),
    );
  });

  test('updateTemplate wraps apiCall with tryOnlineOrEnqueue', async () => {
    const { useTemplates } = await import('./useTemplates');
    const { updateTemplate } = useTemplates();
    await updateTemplate.mutateAsync({ id: 'tpl-1', name: 'Updated' });

    expect(tryOnlineOrEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        entityType: 'template',
        operation: 'save_template',
        entityId: 'tpl-1',
        payload: { name: 'Updated' },
      }),
    );
  });

  test('deleteTemplate wraps apiCall with tryOnlineOrEnqueue', async () => {
    const { useTemplates } = await import('./useTemplates');
    const { deleteTemplate } = useTemplates();
    await deleteTemplate.mutateAsync('tpl-1');

    expect(tryOnlineOrEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        entityType: 'template',
        operation: 'delete_template',
        entityId: 'tpl-1',
        payload: {},
      }),
    );
  });

  test('createTemplate propagates OfflineError on network failure', async () => {
    vi.mocked(tryOnlineOrEnqueue).mockRejectedValue(new OfflineError());
    const { useTemplates } = await import('./useTemplates');
    const { createTemplate } = useTemplates();

    await expect(createTemplate.mutateAsync({ name: 'Test' })).rejects.toThrow(OfflineError);
  });
});
