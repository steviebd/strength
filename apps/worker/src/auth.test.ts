import { describe, expect, test, vi } from 'vitest';
import { betterAuth } from 'better-auth/minimal';
import {
  createAuth,
  resolveCookiePolicy,
  SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from './auth';

vi.mock('better-auth/minimal', () => ({
  betterAuth: vi.fn(() => ({})),
}));

vi.mock('@better-auth/expo', () => ({
  expo: vi.fn(() => ({})),
}));

vi.mock('@better-auth/infra', () => ({
  dash: vi.fn(() => ({})),
}));

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => ({})),
}));

const mockDb = {} as D1Database;

describe('createAuth', () => {
  test('configures sessions to expire after 10 days of inactivity', () => {
    createAuth({
      DB: mockDb,
      BETTER_AUTH_SECRET: 'secret',
      WORKER_BASE_URL: 'http://localhost:8787',
      APP_ENV: 'development',
      POSTHOG_API_KEY: 'phc_test',
      POSTHOG_PROJECT_URL: 'https://test.posthog.com',
    });

    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        session: {
          expiresIn: SESSION_EXPIRES_IN_SECONDS,
          updateAge: SESSION_UPDATE_AGE_SECONDS,
          cookieCache: {
            enabled: true,
            maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
          },
        },
      }),
    );
  });

  test('throws in production when WORKER_BASE_URL is missing', () => {
    expect(() =>
      createAuth({
        DB: mockDb,
        BETTER_AUTH_SECRET: 'secret',
        WORKER_BASE_URL: '',
        APP_ENV: 'production',
        POSTHOG_API_KEY: 'phc_test',
        POSTHOG_PROJECT_URL: 'https://test.posthog.com',
      }),
    ).toThrow(
      'WORKER_BASE_URL must be set and start with https:// in non-development environments',
    );
  });

  test('throws in production when WORKER_BASE_URL is http', () => {
    expect(() =>
      createAuth({
        DB: mockDb,
        BETTER_AUTH_SECRET: 'secret',
        WORKER_BASE_URL: 'http://example.com',
        APP_ENV: 'production',
        POSTHOG_API_KEY: 'phc_test',
        POSTHOG_PROJECT_URL: 'https://test.posthog.com',
      }),
    ).toThrow(
      'WORKER_BASE_URL must be set and start with https:// in non-development environments',
    );
  });

  test('does not throw in development with http base URL', () => {
    expect(() =>
      createAuth({
        DB: mockDb,
        BETTER_AUTH_SECRET: 'secret',
        WORKER_BASE_URL: 'http://localhost:8787',
        APP_ENV: 'development',
        POSTHOG_API_KEY: 'phc_test',
        POSTHOG_PROJECT_URL: 'https://test.posthog.com',
      }),
    ).not.toThrow();
  });

  test('does not throw in production with https base URL', () => {
    expect(() =>
      createAuth({
        DB: mockDb,
        BETTER_AUTH_SECRET: 'secret',
        WORKER_BASE_URL: 'https://example.com',
        APP_ENV: 'production',
        POSTHOG_API_KEY: 'phc_test',
        POSTHOG_PROJECT_URL: 'https://test.posthog.com',
      }),
    ).not.toThrow();
  });
});

describe('resolveCookiePolicy', () => {
  test('dev with http returns lax', () => {
    expect(resolveCookiePolicy('http://localhost:8787', 'http', 'development')).toEqual({
      secure: false,
      sameSite: 'lax',
    });
  });

  test('dev with https returns none', () => {
    expect(resolveCookiePolicy('https://localhost:8787', 'https', 'development')).toEqual({
      secure: true,
      sameSite: 'none',
    });
  });

  test('production with https returns lax so OAuth callback redirects can include state cookies', () => {
    expect(resolveCookiePolicy('https://example.com', 'https', 'production')).toEqual({
      secure: true,
      sameSite: 'lax',
    });
  });

  test('production with https and http client protocol still returns lax', () => {
    expect(resolveCookiePolicy('https://example.com', 'http', 'production')).toEqual({
      secure: true,
      sameSite: 'lax',
    });
  });
});
