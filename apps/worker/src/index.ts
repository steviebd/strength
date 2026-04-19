import { drizzle } from 'drizzle-orm/d1';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { Hono } from 'hono';
import { getSecrets } from '@strength/config';
import * as schema from '@strength/db';

interface Env {
  DB: D1Database;
  INFISICAL_TOKEN: string;
  INFISICAL_WORKSPACE_ID?: string;
  INFISICAL_ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const db = drizzle(c.env.DB, { schema });
  const secrets = await getSecrets();
  
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    secret: secrets.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: secrets.GOOGLE_CLIENT_ID,
        clientSecret: secrets.GOOGLE_CLIENT_SECRET,
      },
    },
    trustedOrigins: ['exp://localhost:8081'],
  });

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
  const db = drizzle(c.env.DB, { schema });
  const secrets = await getSecrets();
  
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    secret: secrets.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: secrets.GOOGLE_CLIENT_ID,
        clientSecret: secrets.GOOGLE_CLIENT_SECRET,
      },
    },
    trustedOrigins: ['exp://localhost:8081'],
  });

  return auth.handler({
    method: c.req.method,
    headers: c.req.raw.headers,
    request: c.req.raw,
  });
});

app.get('/api/health', (c) => c.json({ status: 'ok' }));

export default app;