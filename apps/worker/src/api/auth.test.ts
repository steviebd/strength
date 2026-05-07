import { describe, expect, test, vi } from 'vitest';
import { requireAuth, requireAuthContext } from './auth';

const mockedGetSession = vi.fn();

vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>();
  return {
    ...actual,
    createAuth: vi.fn(() => ({
      api: {
        getSession: mockedGetSession,
      },
    })),
  };
});

function createContext({
  user,
  session,
}: {
  user?: unknown;
  session?: unknown;
} = {}) {
  const store = new Map<string, unknown>();
  if (user !== undefined) store.set('user', user);
  if (session !== undefined) store.set('session', session);

  return {
    env: { DB: {}, APP_ENV: 'development' },
    req: { url: 'http://localhost:8787/api/test', raw: { headers: new Headers() } },
    get(key: string) {
      return store.get(key);
    },
    set(key: string, value: unknown) {
      store.set(key, value);
    },
    json(body: unknown, status = 200) {
      return Response.json(body, { status });
    },
  } as never;
}

const user = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const session = {
  id: 'session-1',
  token: 'token',
  userId: 'user-1',
  expiresAt: new Date(Date.now() + 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('requireAuthContext', () => {
  test('returns 401 when no authenticated user exists', async () => {
    mockedGetSession.mockResolvedValue(null);

    const result = await requireAuthContext(createContext());

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    await expect((result as Response).json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  test('returns AuthContext when session is valid', async () => {
    mockedGetSession.mockResolvedValue({ user, session });

    const result = await requireAuthContext(createContext());

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { userId: string }).userId).toBe('user-1');
  });

  test('uses middleware-cached auth before loading a session again', async () => {
    mockedGetSession.mockClear();

    const result = await requireAuth(createContext({ user, session }));

    expect(result).toEqual({ user, session });
    expect(mockedGetSession).not.toHaveBeenCalled();
  });
});
