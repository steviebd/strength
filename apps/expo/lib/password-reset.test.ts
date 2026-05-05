import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildPasswordResetRedirectURL, requestPasswordResetEmail } from './password-reset';

vi.mock('@/lib/env', () => ({
  env: {
    apiUrl: 'https://strength-dev.stevenduong.com',
  },
}));

describe('password reset', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('uses a web reset callback so links work across devices', () => {
    expect(buildPasswordResetRedirectURL()).toBe(
      'https://strength-dev.stevenduong.com/auth/reset-password',
    );
  });

  test('requests password reset through Better Auth with the web callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await requestPasswordResetEmail('user@example.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://strength-dev.stevenduong.com/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          redirectTo: 'https://strength-dev.stevenduong.com/auth/reset-password',
        }),
      },
    );
  });
});
