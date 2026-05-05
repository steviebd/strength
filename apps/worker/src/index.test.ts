import { describe, expect, test, vi, beforeEach } from 'vitest';
import app from './index';
import { decodeWhoopOAuthState } from './lib/whoop-oauth';
import { exchangeCodeForTokens } from './whoop/auth';
import { getWhoopProfile } from './whoop/api';
import { upsertWhoopProfile } from './whoop/sync';

vi.mock('./api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/auth')>();
  return {
    ...actual,
    loadAuthSession: vi.fn().mockResolvedValue(null),
    createDb: vi.fn(() => createMockDb()),
  };
});

vi.mock('./whoop/auth', () => ({
  exchangeCodeForTokens: vi.fn(),
}));

vi.mock('./whoop/api', () => ({
  getWhoopProfile: vi.fn(),
}));

vi.mock('./whoop/token-rotation', () => ({
  storeWhoopTokens: vi.fn(),
}));

vi.mock('./whoop/sync', () => ({
  upsertWhoopProfile: vi.fn(),
}));

vi.mock('./lib/whoop-oauth', () => ({
  decodeWhoopOAuthState: vi.fn(),
  buildWhoopCallbackRedirect: vi.fn((deepLink, params) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return `${deepLink}?${qs}`;
  }),
  resolveWhoopRedirectBaseURL: vi.fn(() => 'http://localhost:8787'),
}));

function createMockDb() {
  return {
    select: () => ({ from: () => ({ where: () => ({ get: async () => null }) }) }),
    insert: () => ({ values: () => ({ run: async () => ({ success: true }) }) }),
    update: () => ({ set: () => ({ where: () => ({ run: async () => ({ success: true }) }) }) }),
  };
}

const baseEnv = {
  APP_ENV: 'development',
  WORKER_BASE_URL: 'http://localhost:8787',
  APP_SCHEME: 'strength',
  DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'secret',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CORS origin', () => {
  test('dev allows localhost origin', async () => {
    const req = new Request('http://localhost:8787/api/health', {
      headers: { origin: 'http://localhost:3000' },
    });
    const res = await app.fetch(req, { ...baseEnv, APP_ENV: 'development' });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  test('dev allows exp:// origin', async () => {
    const req = new Request('http://localhost:8787/api/health', {
      headers: { origin: 'exp://192.168.1.100:8081' },
    });
    const res = await app.fetch(req, { ...baseEnv, APP_ENV: 'development' });
    expect(res.headers.get('access-control-allow-origin')).toBe('exp://192.168.1.100:8081');
  });

  test('dev denies disallowed origin', async () => {
    const req = new Request('http://localhost:8787/api/health', {
      headers: { origin: 'https://evil.com' },
    });
    const res = await app.fetch(req, { ...baseEnv, APP_ENV: 'development' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('prod allows base URL origin', async () => {
    const req = new Request('https://app.example.com/api/health', {
      headers: { origin: 'https://app.example.com' },
    });
    const res = await app.fetch(req, {
      APP_ENV: 'production',
      WORKER_BASE_URL: 'https://app.example.com',
      APP_SCHEME: 'strength',
      DB: {} as D1Database,
      BETTER_AUTH_SECRET: 'secret',
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
  });

  test('prod allows configured trusted web origin', async () => {
    const req = new Request('https://api.example.com/api/health', {
      headers: { origin: 'https://fit.example.com' },
    });
    const res = await app.fetch(req, {
      APP_ENV: 'production',
      WORKER_BASE_URL: 'https://api.example.com',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://fit.example.com',
      APP_SCHEME: 'strength',
      DB: {} as D1Database,
      BETTER_AUTH_SECRET: 'secret',
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://fit.example.com');
  });

  test('prod denies unknown origin', async () => {
    const req = new Request('https://app.example.com/api/health', {
      headers: { origin: 'https://evil.com' },
    });
    const res = await app.fetch(req, {
      APP_ENV: 'production',
      WORKER_BASE_URL: 'https://app.example.com',
      APP_SCHEME: 'strength',
      DB: {} as D1Database,
      BETTER_AUTH_SECRET: 'secret',
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('/connect-whoop HTML', () => {
  test('escapes error parameter in HTML', async () => {
    const req = new Request('http://localhost:8787/connect-whoop?error=<script>alert(1)</script>');
    const res = await app.fetch(req, baseEnv);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('/api/auth/whoop/callback error mapping', () => {
  test('redirects with no_code when code is missing', async () => {
    vi.mocked(decodeWhoopOAuthState).mockResolvedValue({
      userId: 'user-1',
      returnTo: 'strength://whoop-callback',
    });
    const req = new Request('http://localhost:8787/api/auth/whoop/callback?state=valid');
    const res = await app.fetch(req, baseEnv);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('error=no_code');
  });

  test('redirects with token_exchange_failed on token error', async () => {
    vi.mocked(decodeWhoopOAuthState).mockResolvedValue({
      userId: 'user-1',
      returnTo: 'strength://whoop-callback',
    });
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error('network error'));
    const req = new Request('http://localhost:8787/api/auth/whoop/callback?state=valid&code=123');
    const res = await app.fetch(req, baseEnv);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('error=token_exchange_failed');
  });

  test('redirects with profile_fetch_failed on profile error', async () => {
    vi.mocked(decodeWhoopOAuthState).mockResolvedValue({
      userId: 'user-1',
      returnTo: 'strength://whoop-callback',
    });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'tok',
      refresh_token: 'ref',
      expires_at: Date.now() + 10000,
      scope: 'read',
      token_type: 'bearer',
      expires_in: 3600,
    } as any);
    vi.mocked(getWhoopProfile).mockRejectedValue(new Error('network error'));
    const req = new Request('http://localhost:8787/api/auth/whoop/callback?state=valid&code=123');
    const res = await app.fetch(req, baseEnv);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('error=profile_fetch_failed');
  });

  test('redirects with unknown on unexpected error', async () => {
    vi.mocked(decodeWhoopOAuthState).mockResolvedValue({
      userId: 'user-1',
      returnTo: 'strength://whoop-callback',
    });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'tok',
      refresh_token: 'ref',
      expires_at: Date.now() + 10000,
      scope: 'read',
      token_type: 'bearer',
      expires_in: 3600,
    } as any);
    vi.mocked(getWhoopProfile).mockResolvedValue({ user_id: 'whoop-1' } as any);
    vi.mocked(upsertWhoopProfile).mockRejectedValue(new Error('db fail'));
    const req = new Request('http://localhost:8787/api/auth/whoop/callback?state=valid&code=123');
    const res = await app.fetch(req, baseEnv);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('error=unknown');
  });
});
