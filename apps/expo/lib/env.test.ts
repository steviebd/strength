import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

const originalWorkerBaseUrl = process.env.EXPO_PUBLIC_WORKER_BASE_URL;

afterEach(() => {
  vi.resetModules();
  if (originalWorkerBaseUrl === undefined) {
    delete process.env.EXPO_PUBLIC_WORKER_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_WORKER_BASE_URL = originalWorkerBaseUrl;
  }
});

describe('env', () => {
  test('reports a configuration error instead of throwing when Worker URL is missing', async () => {
    delete process.env.EXPO_PUBLIC_WORKER_BASE_URL;

    const { env, assertAppConfigured } = await import('./env');

    expect(env.configError).toBe('Missing required build-time value: EXPO_PUBLIC_WORKER_BASE_URL');
    expect(() => assertAppConfigured()).toThrow(
      'Missing required build-time value: EXPO_PUBLIC_WORKER_BASE_URL',
    );
  });

  test('rewrites localhost Worker URL to Expo host on native dev builds', async () => {
    process.env.EXPO_PUBLIC_WORKER_BASE_URL = 'http://localhost:8787';

    const { env, assertAppConfigured } = await import('./env');

    expect(env.configError).toBeNull();
    expect(env.apiUrl).toBe('http://192.168.1.10:8787');
    expect(() => assertAppConfigured()).not.toThrow();
  });
});
