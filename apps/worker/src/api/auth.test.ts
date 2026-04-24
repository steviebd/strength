import { describe, expect, test } from 'vitest';
import { requireAuthContext } from './auth';

function createContext({
  user,
  session,
}: {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
}) {
  return {
    env: { DB: {} },
    get(key: string) {
      if (key === 'user') return user;
      if (key === 'session') return session;
      return undefined;
    },
    json(body: unknown, status = 200) {
      return Response.json(body, { status });
    },
  } as never;
}

describe('requireAuthContext', () => {
  test('returns 401 when no authenticated user exists', async () => {
    const result = await requireAuthContext(createContext({ user: null, session: null }));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    await expect((result as Response).json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  test('returns userId from user.id with populated context', async () => {
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
      userId: 'different-session-user',
      expiresAt: new Date(Date.now() + 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: 'wrong-nested-user' },
    };

    const result = await requireAuthContext(createContext({ user, session } as never));

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.userId).toBe('user-1');
    expect(result.user).toBe(user);
    expect(result.session).toBe(session);
    expect(result.db).toBeTruthy();
  });
});
