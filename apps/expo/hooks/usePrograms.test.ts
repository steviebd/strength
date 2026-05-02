import { beforeEach, describe, expect, test, vi } from 'vitest';

let mockUseOfflineQueryReturn: any = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
  })),
  useQuery: vi.fn(),
}));

vi.mock('./useOfflineQuery', () => ({
  useOfflineQuery: vi.fn(() => mockUseOfflineQueryReturn),
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

vi.mock('@/db/workouts', () => ({
  cacheActivePrograms: vi.fn(),
}));

vi.mock('@/db/training-cache', () => ({
  getCachedActivePrograms: vi.fn(),
  getCachedProgramsCatalog: vi.fn(),
  cacheProgramsCatalog: vi.fn(),
  getCachedLatestOneRMs: vi.fn(),
  cacheLatestOneRMs: vi.fn(),
  getFallbackLatestOneRMsFromCycles: vi.fn(),
}));

import { getCachedLatestOneRMs, getFallbackLatestOneRMsFromCycles } from '@/db/training-cache';
import { useOfflineQuery } from './useOfflineQuery';
import { useProgramsCatalog, useLatestOneRms } from './usePrograms';

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOfflineQueryReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
});

describe('useProgramsCatalog', () => {
  test('returns cached data when offline', () => {
    const cached = [{ slug: 'cached-program', name: 'Cached Program' }];
    mockUseOfflineQueryReturn = {
      data: cached,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    const result = useProgramsCatalog();
    expect(result.programs).toEqual(cached);
  });

  test('falls back to fallbackPrograms when cache and API are empty', () => {
    const fallback = [
      {
        slug: 'fallback',
        name: 'Fallback Program',
        description: '',
        difficulty: '',
        daysPerWeek: 3,
        estimatedWeeks: 4,
        totalSessions: 12,
      },
    ];
    mockUseOfflineQueryReturn = {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    const result = useProgramsCatalog(fallback);
    expect(result.programs).toEqual(fallback);
  });
});

describe('useLatestOneRms', () => {
  test('returns cached 1RMs when offline', () => {
    const cached = { squat1rm: 100, bench1rm: 80, deadlift1rm: 150, ohp1rm: 50 };
    mockUseOfflineQueryReturn = {
      data: cached,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    const result = useLatestOneRms();
    expect(result.latestOneRMs).toEqual(cached);
  });

  test('falls back to local program cycles when no cached API response exists', async () => {
    const fromCycles = { squat1rm: 90, bench1rm: 70, deadlift1rm: 140, ohp1rm: 45 };
    vi.mocked(getCachedLatestOneRMs).mockResolvedValue(null);
    vi.mocked(getFallbackLatestOneRMsFromCycles).mockResolvedValue(fromCycles);

    useLatestOneRms();
    const options = vi.mocked(useOfflineQuery).mock.calls[0][0];
    const result = await options.cacheFn();
    expect(result).toEqual(fromCycles);
  });

  test('isDirtyFn prevents overwrite when local cycles differ from cached API response', async () => {
    const cached = { squat1rm: 100, bench1rm: 80, deadlift1rm: 150, ohp1rm: 50 };
    const fromCycles = { squat1rm: 90, bench1rm: 80, deadlift1rm: 150, ohp1rm: 50 };
    vi.mocked(getCachedLatestOneRMs).mockResolvedValue(cached);
    vi.mocked(getFallbackLatestOneRMsFromCycles).mockResolvedValue(fromCycles);

    useLatestOneRms();
    const options = vi.mocked(useOfflineQuery).mock.calls[0][0];
    const isDirty = await options.isDirtyFn!();
    expect(isDirty).toBe(true);
  });
});
