import { drizzle } from 'drizzle-orm/d1';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from '@strength/db';
import { Hono } from 'hono';

interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

const auth = betterAuth({
  database: drizzleAdapter(drizzle(process.env.DB as D1Database), {
    provider: 'sqlite',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  trustedOrigins: ['exp://localhost:8081'],
});

app.use('*', async (c, next) => {
  const authRequest = auth.handleRequest({
    method: c.req.method,
    headers: c.req.raw.headers,
    request: c.req.raw,
  });

  const response = await authRequest;

  if (response) {
    return c.json(response.body, response.status, response.headers);
  }

  return next();
});

app.all('/api/auth/*', async (c) => {
  return auth.handler({
    method: c.req.method,
    headers: c.req.raw.headers,
    request: c.req.raw,
  });
});

app.get('/api/health', (c) => c.json({ status: 'ok' }));

export default app;
