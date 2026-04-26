import { describe, expect, test, vi } from 'vitest';
import { requireAuthContext } from './auth';

const mockedLoadAuthSession = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('./auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth')>();
  return {
    ...actual,
    loadAuthSession: mockedLoadAuthSession,
  };
});

function createContext() {
  return {
    env: { DB: {} },
    req: { url: 'http://localhost:8787/api/test', raw: { headers: new Headers() } },
    get(_key: string) {
      return undefined;
    },
    json(body: unknown, status = 200) {
      return Response.json(body, { status });
    },
  } as never;
}

describe('requireAuthContext', () => {
  test('returns 401 when no authenticated user exists', async () => {
    mockedLoadAuthSession.mockResolvedValue(null);

    const result = await requireAuthContext(createContext());

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    await expect((result as Response).json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  test('returns AuthContext when session is valid', async () => {
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

    mockedLoadAuthSession.mockResolvedValue({ user, session });

    const result = await requireAuthContext(createContext());

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});
