import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import healthRouter from './health';

const app = new Hono();
app.route('/api', healthRouter);

describe('health routes', () => {
  test('/health returns 200', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  test('/debug/auth-check returns 404', async () => {
    const res = await app.request('/api/debug/auth-check');
    expect(res.status).toBe(404);
  });
});
