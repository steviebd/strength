import { createAuth, type WorkerEnv } from '../auth';

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
