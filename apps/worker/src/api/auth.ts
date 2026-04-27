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
  const originalOrigin = headers.get('origin');

  if (!originalOrigin && expoOrigin) {
    headers.set('origin', expoOrigin);
  }

  return headers;
}

export function getAuth(c: any) {
  const headers = getAuthHeaders(c);
  const origin = headers.get('origin') ?? undefined;
  return createAuth(c.env as WorkerEnv, headers, origin);
}

export async function loadAuthSession(c: any) {
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

export const requireAuthDb = requireAuthContext;

export type SecuredHandler<R = Response> = (
  c: AppContext,
  data: { userId: string; db: AppDb },
) => Promise<R>;

export function createHandler<R = Response>(
  handler: SecuredHandler<R>,
): (c: AppContext) => Promise<Response | R> {
  return async (c: AppContext) => {
    console.log('[AUTH DEBUG] path:', c.req.path, 'method:', c.req.method);
    console.log('[AUTH DEBUG] session from context:', c.get('session')?.id ?? 'null');
    console.log('[AUTH DEBUG] user from context:', c.get('user')?.id ?? 'null');
    const auth = await requireAuthContext(c);
    if (auth instanceof Response) {
      console.log('[AUTH DEBUG] auth failed, returning', auth.status);
      return auth;
    }
    console.log('[AUTH DEBUG] auth success, userId:', auth.userId);
    return handler(c, { userId: auth.userId, db: auth.db });
  };
}
