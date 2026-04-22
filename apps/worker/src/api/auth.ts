import { createAuth, type WorkerEnv } from '../auth';

function getAuthHeaders(c: any) {
  const headers = new Headers(c.req.raw.headers);
  const expoOrigin = headers.get('expo-origin');

  if (!headers.get('origin') && expoOrigin) {
    headers.set('origin', expoOrigin);
  }

  return headers;
}

export async function requireAuth(c: any) {
  const user = c.get('user');
  const session = c.get('session');

  if (user && session) {
    return { user, session };
  }

  const auth = createAuth(c.env as WorkerEnv);
  const resolvedSession = await auth.api.getSession({ headers: getAuthHeaders(c) });

  if (!resolvedSession) {
    return { user: null, session: null };
  }

  return resolvedSession;
}
