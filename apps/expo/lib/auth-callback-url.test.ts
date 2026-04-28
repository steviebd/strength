import { describe, expect, test, vi } from 'vitest';

vi.mock('expo-linking', () => ({
  createURL: vi.fn((path: string) => `strength://${path.replace(/^\//, '')}`),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('buildAuthCallbackURL', () => {
  test('builds native callback URLs with encoded return target', async () => {
    const { buildAuthCallbackURL } = await import('./auth-callback-url');

    expect(buildAuthCallbackURL('strength://home?tab=profile')).toBe(
      'strength://auth/callback?returnTo=strength%3A%2F%2Fhome%3Ftab%3Dprofile',
    );
  });
});
