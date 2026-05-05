import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';

const router = createRouter();

router.get('/health', (c) => {
  return c.json({
    ok: true,
    authEnabled: true,
  });
});

router.get(
  '/me',
  createHandler(async (c) => {
    const user = c.get('user');
    const session = c.get('session');

    // Return only safe, non-sensitive fields. Never expose the session token.
    const safeUser = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      : null;

    const safeSession = session
      ? {
          id: session.id,
          expiresAt: session.expiresAt,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        }
      : null;

    return c.json({ user: safeUser, session: safeSession });
  }),
);

export default router;
