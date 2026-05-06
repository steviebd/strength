import { describe, expect, test, vi } from 'vitest';

vi.mock('expo-linking', () => ({
  createURL: vi.fn((path: string) => `strength://${path.replace(/^\//, '')}`),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('buildAuthCallbackURL', () => {
  test('builds stable native callback URLs without route state in the query string', async () => {
    const { buildAuthCallbackURL } = await import('./auth-callback-url');

    expect(buildAuthCallbackURL('strength://home?tab=profile')).toBe('strength://auth/callback');
  });
});
