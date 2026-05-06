import { beforeEach, describe, expect, test, vi } from 'vitest';

const storage = new Map<string, string>();

vi.mock('@better-auth/expo/client', () => ({
  getSetCookie: vi.fn((cookie: string, previousCookie?: string) =>
    previousCookie ? `${previousCookie}; ${cookie}` : cookie,
  ),
}));

vi.mock('@/lib/platform-storage', () => ({
  platformStorage: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authCookieStorageKey: 'strength_cookie',
}));

describe('persistAuthCallbackCookie', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  test('stores callback cookie in the Better Auth Expo cookie jar', async () => {
    const { persistAuthCallbackCookie } = await import('./auth-callback-cookie');

    expect(persistAuthCallbackCookie('better-auth.session_token=abc; Path=/')).toBe(true);
    expect(storage.get('strength_cookie')).toBe('better-auth.session_token=abc; Path=/');
  });

  test('merges callback cookie with existing stored cookies', async () => {
    const { persistAuthCallbackCookie } = await import('./auth-callback-cookie');

    storage.set('strength_cookie', 'better-auth.oauth_state=state');

    expect(persistAuthCallbackCookie('better-auth.session_token=abc; Path=/')).toBe(true);
    expect(storage.get('strength_cookie')).toBe(
      'better-auth.oauth_state=state; better-auth.session_token=abc; Path=/',
    );
  });

  test('ignores missing callback cookies', async () => {
    const { persistAuthCallbackCookie } = await import('./auth-callback-cookie');

    expect(persistAuthCallbackCookie(undefined)).toBe(false);
    expect(storage.has('strength_cookie')).toBe(false);
  });
});
