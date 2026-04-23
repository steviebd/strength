import { drizzle } from 'drizzle-orm/d1';
import type { Context } from 'hono';
import { createAuth, type WorkerEnv } from '../auth';
import * as schema from '@strength/db';

type AuthInstance = ReturnType<typeof createAuth>;

export type AuthUser = AuthInstance['$Infer']['Session']['user'];
export type AuthSession = AuthInstance['$Infer']['Session']['session'];

export type AppVariables = {
  user: AuthUser | null;
  session: AuthSession | null;
};

export type AppContext = Context<{ Bindings: WorkerEnv; Variables: AppVariables }>;

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

export function getAuthHeaders(c: any) {
  const headers = new Headers(c.req.raw.headers);
  const expoOrigin = headers.get('expo-origin');

  if (!headers.get('origin') && expoOrigin) {
    headers.set('origin', expoOrigin);
  }

  return headers;
}

export function getAuth(c: any) {
  return createAuth(c.env as WorkerEnv, c.req.url, getAuthHeaders(c).get('origin') ?? undefined);
}

export async function loadAuthSession(c: any) {
  const auth = getAuth(c);
  return await auth.api.getSession({ headers: getAuthHeaders(c) });
}

export async function populateAuthContext(c: any) {
  const resolvedSession = await loadAuthSession(c);
  const session = resolvedSession?.session ?? null;
  const user = resolvedSession?.user ?? null;

  c.set('user', user);
  c.set('session', session);

  return { user, session };
}

export async function requireAuth(c: any) {
  const user = c.get('user');
  const session = c.get('session');

  if (user !== undefined && session !== undefined) {
    return { user: user ?? null, session: session ?? null };
  }

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

export const requireAuthDb = requireAuthContext;

export type SecuredHandler<R = Response> = (
  c: AppContext,
  data: { userId: string; db: AppDb },
) => Promise<R>;

export function createHandler<R = Response>(
  handler: SecuredHandler<R>,
): (c: AppContext) => Promise<Response | R> {
  return async (c: AppContext) => {
    const auth = await requireAuthContext(c);
    if (auth instanceof Response) return auth;
    return handler(c, { userId: auth.userId, db: auth.db });
  };
}
