import { createDb } from '../api/auth';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import * as schema from '@strength/db';

const router = createRouter();

router.get('/health', (c) => {
  return c.json({
    ok: true,
    authEnabled: true,
  });
});

router.get('/debug/auth-check', async (c) => {
  const db = createDb(c.env);
  const users = await db.select().from(schema.user).all();
  const sessions = await db.select().from(schema.session).all();
  return c.json({
    userCount: users.length,
    sessionCount: sessions.length,
    users: users.map((u) => ({ id: u.id, email: u.email, name: u.name })),
    sessions: sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      expiresAt: new Date(s.expiresAt).toISOString(),
    })),
  });
});

router.get(
  '/me',
  createHandler(async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    return c.json({ user, session });
  }),
);

export default router;
