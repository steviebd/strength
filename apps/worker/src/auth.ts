import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@strength/db';

export interface WorkerEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  APP_ENV?: string;
  WHOOP_CLIENT_ID?: string;
  WHOOP_CLIENT_SECRET?: string;
  WHOOP_WEBHOOK_SECRET?: string;
  ENCRYPTION_MASTER_KEY?: string;
}

function getProcessEnv() {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return maybeProcess.process?.env ?? {};
}

export function resolveWorkerEnv(env: WorkerEnv): WorkerEnv {
  const processEnv = getProcessEnv();

  return {
    ...env,
    APP_ENV: env.APP_ENV ?? processEnv.APP_ENV,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? processEnv.BETTER_AUTH_SECRET ?? '',
    BETTER_AUTH_URL: env.BETTER_AUTH_URL ?? processEnv.BETTER_AUTH_URL ?? '',
    BETTER_AUTH_TRUSTED_ORIGINS:
      env.BETTER_AUTH_TRUSTED_ORIGINS ?? processEnv.BETTER_AUTH_TRUSTED_ORIGINS,
    WHOOP_CLIENT_ID: env.WHOOP_CLIENT_ID ?? processEnv.WHOOP_CLIENT_ID,
    WHOOP_CLIENT_SECRET: env.WHOOP_CLIENT_SECRET ?? processEnv.WHOOP_CLIENT_SECRET,
    ENCRYPTION_MASTER_KEY: env.ENCRYPTION_MASTER_KEY ?? processEnv.ENCRYPTION_MASTER_KEY,
  };
}

export function createAuth(env: WorkerEnv) {
  const resolvedEnv = resolveWorkerEnv(env);
  const db = drizzle(resolvedEnv.DB, { schema });

  return betterAuth({
    baseURL: resolvedEnv.BETTER_AUTH_URL,
    secret: resolvedEnv.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: ['strength://', 'strength://*'],
    cookies: {
      secure: true,
      sameSite: 'strict',
    },
    rateLimit: {
      maxRequests: 5,
      window: 60,
    },
    plugins: [expo()],
  });
}

export function isDevAuthEnabled(env: WorkerEnv) {
  return (resolveWorkerEnv(env).APP_ENV ?? 'development') === 'development';
}
