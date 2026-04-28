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
    return c.json({ user, session });
  }),
);

export default router;
