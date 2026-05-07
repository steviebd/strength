import { drizzle } from 'drizzle-orm/d1';
import type { Context } from 'hono';
import { createAuth, resolveBaseURL, type WorkerEnv } from '../auth';
import * as schema from '@strength/db';

type AuthInstance = ReturnType<typeof createAuth>;

type AuthUser = AuthInstance['$Infer']['Session']['user'];
type AuthSession = AuthInstance['$Infer']['Session']['session'];

export type AppVariables = {
  user: AuthUser | null;
  session: AuthSession | null;
  auth: AuthInstance | null;
};

type AppContext = Context<{ Bindings: WorkerEnv; Variables: AppVariables }>;

export function createDb(env: WorkerEnv) {
  return drizzle(env.DB, { schema });
}

export type AppDb = ReturnType<typeof createDb>;

export type AuthContext = {
  db: AppDb;
  user: AuthUser;
  session: AuthSession;
  userId: string;
};

function getAuthHeaders(c: any) {
  // Do not trust client-provided expo-origin as origin replacement
  return new Headers(c.req.raw.headers);
}

export function getAuth(c: any) {
  const cached = c.get('auth');
  if (cached) {
    return cached;
  }

  const headers = getAuthHeaders(c);
  const clientOrigin = headers.get('origin');
  // For native clients without standard Origin header, use the worker's configured base URL
  const origin = clientOrigin || resolveBaseURL(c.env as WorkerEnv) || undefined;
  const auth = createAuth(c.env as WorkerEnv, headers, origin);
  c.set('auth', auth);
  return auth;
}

async function loadAuthSession(c: any) {
  const auth = getAuth(c);
  const headers = getAuthHeaders(c);
  const session = await auth.api.getSession({ headers });
  return session;
}

export async function populateAuthContext(c: any) {
  const resolvedSession = await loadAuthSession(c);
  const session = resolvedSession?.session ?? null;
  const user = resolvedSession?.user ?? null;

  c.set('user', user);
  c.set('session', session);

  return { user, session };
}

/**
 * Returns the current auth session. Callers MUST check for null before using
 * the returned user/session — this function does not throw on unauthenticated
 * requests.
 */
export async function requireAuth(c: any) {
  const resolvedSession = await loadAuthSession(c);

  if (!resolvedSession) {
    return { user: null, session: null };
  }

  return resolvedSession;
}

export async function requireAuthContext(c: AppContext): Promise<AuthContext | Response> {
  const { user, session } = await requireAuth(c);
  if (!user?.id || !session) {
    return c.json({ message: 'Unauthorized' }, 401);
  }

  return { userId: user.id, user, session, db: createDb(c.env) };
}

type SecuredHandler<R = Response> = (
  c: AppContext,
  data: { userId: string; db: AppDb },
) => Promise<R>;

export function createHandler<R = Response>(
  handler: SecuredHandler<R>,
): (c: AppContext) => Promise<Response | R> {
  return async (c: AppContext) => {
    const auth = await requireAuthContext(c);
    if (auth instanceof Response) {
      return auth;
    }
    try {
      return await handler(c, { userId: auth.userId, db: auth.db });
    } catch (err) {
      console.error('Handler error:', err);
      return c.json({ message: 'Internal server error' }, 500);
    }
  };
}
