import { createRouter } from '../lib/router';
import type { WorkerEnv } from '../auth';

const router = createRouter();

function isE2EEnabled(env: WorkerEnv) {
  return env.APP_ENV === 'development' && env.E2E_TEST_MODE === 'true';
}

function isAuthorized(c: any) {
  const secret = c.env.E2E_TEST_SECRET;
  return Boolean(secret && c.req.header('x-e2e-secret') === secret);
}

async function resetUserData(env: WorkerEnv, email: string) {
  const userRow = await env.DB.prepare('select id from user where email = ?').bind(email).first<{
    id: string;
  }>();

  if (!userRow?.id) {
    await env.DB.prepare('delete from verification where identifier = ?').bind(email).run();
    return { deleted: false };
  }

  const userId = userRow.id;
  await env.DB.batch([
    env.DB.prepare('delete from nutrition_chat_messages where user_id = ?').bind(userId),
    env.DB.prepare('delete from nutrition_entries where user_id = ?').bind(userId),
    env.DB.prepare('delete from nutrition_training_context where user_id = ?').bind(userId),
    env.DB.prepare('delete from user_body_stats where user_id = ?').bind(userId),
    env.DB.prepare('delete from rate_limit where user_id = ?').bind(userId),
    env.DB.prepare(
      'delete from program_cycle_workouts where cycle_id in (select id from user_program_cycles where user_id = ?)',
    ).bind(userId),
    env.DB.prepare(
      'delete from workout_sets where workout_exercise_id in (select id from workout_exercises where workout_id in (select id from workouts where user_id = ?))',
    ).bind(userId),
    env.DB.prepare(
      'delete from workout_exercises where workout_id in (select id from workouts where user_id = ?)',
    ).bind(userId),
    env.DB.prepare('delete from workouts where user_id = ?').bind(userId),
    env.DB.prepare(
      'delete from template_exercises where template_id in (select id from templates where user_id = ?)',
    ).bind(userId),
    env.DB.prepare('delete from templates where user_id = ?').bind(userId),
    env.DB.prepare('delete from exercises where user_id = ?').bind(userId),
    env.DB.prepare('delete from user_program_cycles where user_id = ?').bind(userId),
    env.DB.prepare('delete from user_integration where user_id = ?').bind(userId),
    env.DB.prepare('delete from whoop_profile where user_id = ?').bind(userId),
    env.DB.prepare('delete from whoop_workout where user_id = ?').bind(userId),
    env.DB.prepare('delete from whoop_recovery where user_id = ?').bind(userId),
    env.DB.prepare('delete from whoop_cycle where user_id = ?').bind(userId),
    env.DB.prepare('delete from whoop_sleep where user_id = ?').bind(userId),
    env.DB.prepare('delete from whoop_body_measurement where user_id = ?').bind(userId),
    env.DB.prepare('delete from session where user_id = ?').bind(userId),
    env.DB.prepare('delete from user_preferences where user_id = ?').bind(userId),
    env.DB.prepare('delete from verification where identifier = ?').bind(email),
  ]);

  return { deleted: true };
}

router.post('/reset-user', async (c) => {
  if (!isE2EEnabled(c.env) || !isAuthorized(c)) {
    return c.json({ message: 'Not found' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email) {
    return c.json({ message: 'email is required' }, 400);
  }

  const result = await resetUserData(c.env, email);
  return c.json({ ok: true, ...result });
});

router.get('/status', async (c) => {
  if (!isE2EEnabled(c.env) || !isAuthorized(c)) {
    return c.json({ message: 'Not found' }, 404);
  }

  return c.json({ ok: true, appEnv: c.env.APP_ENV, e2eTestMode: c.env.E2E_TEST_MODE });
});

export default router;
