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
    console.log('[AUTH getAuthHeaders] Set origin from expo-origin:', expoOrigin);
  }

  console.log('[AUTH getAuthHeaders]', {
    path: c.req.path,
    originalOrigin,
    expoOrigin,
    finalOrigin: headers.get('origin'),
    cookie: headers.get('cookie')?.slice(0, 50) ?? 'none',
  });

  return headers;
}

export function getAuth(c: any) {
  const headers = getAuthHeaders(c);
  const origin = headers.get('origin') ?? undefined;
  const xForwardedProto = headers.get('x-forwarded-proto');
  console.log('[AUTH getAuth]', {
    url: c.req.url,
    origin,
    xForwardedProto,
  });
  return createAuth(c.env as WorkerEnv, headers, origin);
}

export async function loadAuthSession(c: any) {
  const auth = getAuth(c);
  const headers = getAuthHeaders(c);
  console.log('[AUTH loadAuthSession] calling getSession for path:', c.req.path);
  const session = await auth.api.getSession({ headers });
  console.log('[AUTH loadAuthSession] result:', {
    hasSession: !!session,
    hasUser: !!session?.user,
    hasSessionData: !!session?.session,
    userId: session?.user?.id,
    sessionId: session?.session?.id,
  });
  return session;
}

export async function populateAuthContext(c: any) {
  const resolvedSession = await loadAuthSession(c);
  const session = resolvedSession?.session ?? null;
  const user = resolvedSession?.user ?? null;

  c.set('user', user);
  c.set('session', session);

  console.log('[AUTH populateAuthContext]', {
    path: c.req.path,
    hasUser: !!user,
    hasSession: !!session,
    userId: user?.id,
  });

  return { user, session };
}

export async function requireAuth(c: any) {
  const resolvedSession = await loadAuthSession(c);

  if (!resolvedSession) {
    console.log('[AUTH requireAuth] No session resolved for path:', c.req.path);
    return { user: null, session: null };
  }

  console.log('[AUTH requireAuth] Session resolved for path:', c.req.path, {
    userId: resolvedSession.user?.id,
    sessionId: resolvedSession.session?.id,
  });

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
