import { describe, expect, test, vi } from 'vitest';
import {
  buildWhoopCallbackRedirect,
  decodeWhoopOAuthState,
  encodeWhoopOAuthState,
  isAllowedWhoopRedirectBaseURL,
  isAllowedWhoopReturnTo,
  resolveWhoopRedirectBaseURL,
} from './whoop-oauth';

describe('whoop oauth helpers', () => {
  test('round-trips signed state and filters unsafe return URLs', async () => {
    const state = await encodeWhoopOAuthState('secret', {
      nonce: 'nonce-1',
      returnTo: 'strength://whoop-callback',
      userId: 'user-1',
    });

    await expect(decodeWhoopOAuthState('secret', state)).resolves.toEqual({
      nonce: 'nonce-1',
      returnTo: 'strength://whoop-callback',
      userId: 'user-1',
    });

    const unsafeState = await encodeWhoopOAuthState('secret', {
      nonce: 'nonce-1',
      returnTo: 'javascript:alert(1)',
      userId: 'user-1',
    });

    await expect(decodeWhoopOAuthState('secret', unsafeState)).resolves.toEqual({
      nonce: 'nonce-1',
      userId: 'user-1',
    });
  });

  test('rejects missing, tampered, and expired state', async () => {
    await expect(decodeWhoopOAuthState(undefined, 'state')).resolves.toEqual({});
    await expect(decodeWhoopOAuthState('secret', 'bad.state.extra')).resolves.toEqual({});

    const state = await encodeWhoopOAuthState('secret', { nonce: 'nonce-1', userId: 'user-1' });
    await expect(decodeWhoopOAuthState('other-secret', state)).resolves.toEqual({});

    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    const expiring = await encodeWhoopOAuthState('secret', { nonce: 'nonce-1', userId: 'user-1' });
    now.mockReturnValue(11 * 60 * 1000);
    await expect(decodeWhoopOAuthState('secret', expiring)).resolves.toEqual({});
    now.mockRestore();
  });

  test('builds callback redirects and validates allowed URLs', () => {
    expect(buildWhoopCallbackRedirect('strength://callback', { success: 'true' })).toBe(
      'strength://callback?success=true',
    );
    expect(buildWhoopCallbackRedirect('strength://callback?existing=1', { error: 'bad' })).toBe(
      'strength://callback?existing=1&error=bad',
    );
    expect(isAllowedWhoopRedirectBaseURL('https://app.example.com')).toBe(true);
    expect(isAllowedWhoopRedirectBaseURL('http://localhost:8787')).toBe(true);
    expect(isAllowedWhoopRedirectBaseURL('http://evil.com')).toBe(false);
    expect(isAllowedWhoopReturnTo('strength://whoop-callback')).toBe(true);
    expect(isAllowedWhoopReturnTo('javascript:alert(1)')).toBe(false);
  });

  test('uses request origin for LAN dev when configured base URL is loopback', () => {
    expect(
      resolveWhoopRedirectBaseURL(
        {
          APP_ENV: 'development',
          WORKER_BASE_URL: 'http://localhost:8787',
        } as never,
        'http://192.168.1.10:8787/connect-whoop',
      ),
    ).toBe('http://192.168.1.10:8787');
  });
});
