import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useOfflineQuery } from './useOfflineQuery';

const setQueryDataMock = vi.fn();
let lastQueryOptions: { queryFn: () => Promise<unknown> } | undefined;
const mockPlatform = vi.hoisted(() => ({ OS: 'ios' }));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    setQueryData: setQueryDataMock,
  })),
  useQuery: vi.fn((options: { queryFn: () => Promise<unknown> }) => {
    lastQueryOptions = options;
    return { data: undefined, isLoading: false, isError: false, error: null } as unknown;
  }),
}));

vi.mock('react-native', () => ({
  Platform: mockPlatform,
}));

beforeEach(() => {
  mockPlatform.OS = 'ios';
  vi.clearAllMocks();
  lastQueryOptions = undefined;
});

describe('useOfflineQuery', () => {
  test('cache-first: returns cached data immediately and triggers background API call', async () => {
    const cached = { id: 'cached' };
    const apiData = { id: 'api' };
    const cacheFn = vi.fn().mockResolvedValue(cached);
    const apiFn = vi.fn().mockResolvedValue(apiData);
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['test'],
      apiFn,
      cacheFn,
      writeCacheFn,
    });

    expect(lastQueryOptions).toBeDefined();
    const data = await lastQueryOptions!.queryFn();
    expect(data).toEqual(cached);
    expect(cacheFn).toHaveBeenCalledTimes(1);
    expect(apiFn).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(writeCacheFn).toHaveBeenCalledWith(apiData);
    expect(setQueryDataMock).toHaveBeenCalledWith(['test'], apiData);
  });

  test('API-first: when cache is empty, returns API data and writes cache', async () => {
    const apiData = { id: 'api' };
    const cacheFn = vi.fn().mockResolvedValue(null);
    const apiFn = vi.fn().mockResolvedValue(apiData);
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['test'],
      apiFn,
      cacheFn,
      writeCacheFn,
    });

    const data = await lastQueryOptions!.queryFn();
    expect(data).toEqual(apiData);
    expect(writeCacheFn).toHaveBeenCalledWith(apiData);
  });

  test('fallback on error: when fallbackToCacheOnError is true and API fails, returns cached data', async () => {
    const cached = { id: 'cached' };
    const cacheFn = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(cached);
    const apiFn = vi.fn().mockRejectedValue(new Error('network error'));
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['test'],
      apiFn,
      cacheFn,
      writeCacheFn,
      fallbackToCacheOnError: true,
    });

    const data = await lastQueryOptions!.queryFn();
    expect(data).toEqual(cached);
  });

  test('fallback on error: rethrows when fallbackToCacheOnError is false', async () => {
    const cacheFn = vi.fn().mockResolvedValue(null);
    const apiFn = vi.fn().mockRejectedValue(new Error('network error'));
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['test'],
      apiFn,
      cacheFn,
      writeCacheFn,
    });

    await expect(lastQueryOptions!.queryFn()).rejects.toThrow('network error');
  });

  test('background refresh updates React Query cache via setQueryData', async () => {
    const cached = { id: 'cached' };
    const apiData = { id: 'api' };
    const cacheFn = vi.fn().mockResolvedValue(cached);
    const apiFn = vi.fn().mockResolvedValue(apiData);
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['background-test'],
      apiFn,
      cacheFn,
      writeCacheFn,
    });

    await lastQueryOptions!.queryFn();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(setQueryDataMock).toHaveBeenCalledWith(['background-test'], apiData);
  });

  test('background refresh skips cache write when isDirtyFn returns true', async () => {
    const cached = { id: 'cached' };
    const apiData = { id: 'api' };
    const cacheFn = vi.fn().mockResolvedValue(cached);
    const apiFn = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(apiData), 20)));
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);
    const isDirtyFn = vi.fn().mockResolvedValue(true);

    useOfflineQuery({
      queryKey: ['dirty-test'],
      apiFn,
      cacheFn,
      writeCacheFn,
      isDirtyFn,
    });

    await lastQueryOptions!.queryFn();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writeCacheFn).not.toHaveBeenCalled();
    expect(setQueryDataMock).not.toHaveBeenCalled();
  });

  test('network-first: returns API data and refreshes cache even when cached data exists', async () => {
    const cached = { id: 'cached' };
    const apiData = { id: 'api' };
    const cacheFn = vi.fn().mockResolvedValue(cached);
    const apiFn = vi.fn().mockResolvedValue(apiData);
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['network-first-test'],
      apiFn,
      cacheFn,
      writeCacheFn,
      networkFirst: true,
    });

    const data = await lastQueryOptions!.queryFn();
    expect(data).toEqual(apiData);
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(cacheFn).not.toHaveBeenCalled();
    expect(writeCacheFn).toHaveBeenCalledWith(apiData);
  });

  test('network-first: falls back to cached data when API fails', async () => {
    const cached = { id: 'cached' };
    const cacheFn = vi.fn().mockResolvedValue(cached);
    const apiFn = vi.fn().mockRejectedValue(new Error('network error'));
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['network-first-fallback-test'],
      apiFn,
      cacheFn,
      writeCacheFn,
      networkFirst: true,
    });

    const data = await lastQueryOptions!.queryFn();
    expect(data).toEqual(cached);
    expect(writeCacheFn).not.toHaveBeenCalled();
  });

  test('web: uses API only and skips local cache reads and writes', async () => {
    mockPlatform.OS = 'web';
    const apiData = { id: 'api' };
    const cacheFn = vi.fn().mockResolvedValue({ id: 'cached' });
    const apiFn = vi.fn().mockResolvedValue(apiData);
    const writeCacheFn = vi.fn().mockResolvedValue(undefined);

    useOfflineQuery({
      queryKey: ['web-test'],
      apiFn,
      cacheFn,
      writeCacheFn,
      fallbackToCacheOnError: true,
    });

    const data = await lastQueryOptions!.queryFn();
    expect(data).toEqual(apiData);
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(cacheFn).not.toHaveBeenCalled();
    expect(writeCacheFn).not.toHaveBeenCalled();
  });
});
