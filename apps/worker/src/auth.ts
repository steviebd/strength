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
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_NAME?: string;
  AI_MODEL_NAME?: string;
  CF_AI_GATEWAY_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
  WHOOP_CLIENT_ID?: string;
  WHOOP_CLIENT_SECRET?: string;
  WHOOP_WEBHOOK_SECRET?: string;
  ENCRYPTION_MASTER_KEY?: string;
}

type SameSitePolicy = 'strict' | 'lax' | 'none';

function getProcessEnv() {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return maybeProcess.process?.env ?? {};
}

function normalizeBaseURL(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

function parseTrustedOrigins(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => normalizeBaseURL(origin))
    .filter((origin): origin is string => Boolean(origin));
}

function resolveCookiePolicy(baseURL: string | undefined): {
  secure: boolean;
  sameSite: SameSitePolicy;
} {
  const isHttps = baseURL?.startsWith('https://') ?? false;

  if (isHttps) {
    return {
      secure: true,
      sameSite: 'strict',
    };
  }

  return {
    secure: false,
    sameSite: 'lax',
  };
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
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID ?? processEnv.CLOUDFLARE_ACCOUNT_ID,
    AI_GATEWAY_NAME: env.AI_GATEWAY_NAME ?? processEnv.AI_GATEWAY_NAME,
    AI_MODEL_NAME: env.AI_MODEL_NAME ?? processEnv.AI_MODEL_NAME,
    CF_AI_GATEWAY_TOKEN: env.CF_AI_GATEWAY_TOKEN ?? processEnv.CF_AI_GATEWAY_TOKEN,
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN ?? processEnv.CLOUDFLARE_API_TOKEN,
    WHOOP_CLIENT_ID: env.WHOOP_CLIENT_ID ?? processEnv.WHOOP_CLIENT_ID,
    WHOOP_CLIENT_SECRET: env.WHOOP_CLIENT_SECRET ?? processEnv.WHOOP_CLIENT_SECRET,
    ENCRYPTION_MASTER_KEY: env.ENCRYPTION_MASTER_KEY ?? processEnv.ENCRYPTION_MASTER_KEY,
  };
}

export function resolveBaseURL(env: WorkerEnv, requestUrl?: string) {
  const resolvedEnv = resolveWorkerEnv(env);
  const configuredBaseURL = normalizeBaseURL(resolvedEnv.BETTER_AUTH_URL);

  if (configuredBaseURL) {
    return configuredBaseURL;
  }

  return normalizeBaseURL(requestUrl);
}

export function createAuth(env: WorkerEnv, requestUrl?: string, requestOrigin?: string) {
  const resolvedEnv = resolveWorkerEnv(env);
  const db = drizzle(resolvedEnv.DB, { schema });
  const baseURL = resolveBaseURL(resolvedEnv, requestUrl);
  const cookiePolicy = resolveCookiePolicy(baseURL);
  const trustedOrigins = [
    'strength://',
    'strength://*',
    ...parseTrustedOrigins(resolvedEnv.BETTER_AUTH_TRUSTED_ORIGINS),
    ...(baseURL ? [baseURL] : []),
    ...(normalizeBaseURL(requestOrigin) ? [normalizeBaseURL(requestOrigin)!] : []),
  ];

  return betterAuth({
    ...(baseURL ? { baseURL } : {}),
    secret: resolvedEnv.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: Array.from(new Set(trustedOrigins)),
    cookies: {
      secure: cookiePolicy.secure,
      sameSite: cookiePolicy.sameSite,
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
