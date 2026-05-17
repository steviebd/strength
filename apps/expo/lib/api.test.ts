import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));

vi.mock('expo-linking', () => ({
  createURL: vi.fn((path: string) => `strength://${path.replace(/^\//, '')}`),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('./auth-client', () => ({
  authClient: {
    $fetch: fetchMock,
  },
}));

process.env.EXPO_PUBLIC_WORKER_BASE_URL = 'http://localhost:8787';

describe('apiFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    Reflect.deleteProperty(globalThis, 'document');
  });

  test('calls auth client with resolved relative API URL', async () => {
    const { apiFetch } = await import('./api');
    fetchMock.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(apiFetch('/api/health')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/health', undefined);
  });

  test('surfaces server errors as ApiError', async () => {
    const { apiFetch } = await import('./api');
    fetchMock.mockResolvedValue({
      data: null,
      error: { status: 400, statusText: 'Bad Request', message: 'Invalid input' },
    });

    await expect(apiFetch('/api/workouts')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid input',
      status: 400,
    });
  });

  test('returns null for empty success payloads', async () => {
    const { apiFetch } = await import('./api');
    fetchMock.mockResolvedValue({ data: null, error: null });

    await expect(apiFetch('/api/no-content')).resolves.toBeNull();
  });

  test('adds CSRF header from web cookie for mutations', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        cookie: 'other=value; csrf_token=csrf-123',
      },
    });

    const { apiFetch } = await import('./api');
    fetchMock.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(apiFetch('/api/profile/preferences', { method: 'PUT' })).resolves.toEqual({
      ok: true,
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.get('x-csrf-token')).toBe('csrf-123');
  });
});
