import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { hashPassword, verifyPassword } from './auth/password';

export interface WorkerEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  WORKER_BASE_URL: string;
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
    const origin = new URL(trimmed).origin;
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

function normalizeTrustedOrigin(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const origin = new URL(trimmed).origin;
    return origin === 'null' ? trimmed : origin;
  } catch {
    return trimmed;
  }
}

function parseTrustedOrigins(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => normalizeTrustedOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
}

function getClientProtocol(headers: Headers): 'https' | 'http' {
  const forwardedProto = headers.get('x-forwarded-proto');
  if (forwardedProto === 'https') {
    return 'https';
  }
  return 'http';
}

function resolveCookiePolicy(
  baseURL: string | undefined,
  clientProtocol: 'https' | 'http',
  appEnv?: string,
): {
  secure: boolean;
  sameSite: SameSitePolicy;
} {
  const baseURLIsHttps = baseURL?.startsWith('https://');
  const isDevMode = appEnv === 'development';

  if (clientProtocol === 'https' && baseURLIsHttps && !isDevMode) {
    return {
      secure: true,
      sameSite: 'strict',
    };
  }

  if (isDevMode) {
    return {
      secure: false,
      sameSite: 'lax',
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
    WORKER_BASE_URL: env.WORKER_BASE_URL ?? processEnv.WORKER_BASE_URL ?? '',
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

export function resolveBaseURL(env: WorkerEnv) {
  const resolvedEnv = resolveWorkerEnv(env);
  const configuredBaseURL = normalizeBaseURL(resolvedEnv.WORKER_BASE_URL);

  return configuredBaseURL;
}

export function createAuth(env: WorkerEnv, headers?: Headers, requestOrigin?: string) {
  const resolvedEnv = resolveWorkerEnv(env);
  const db = drizzle(resolvedEnv.DB, { schema });
  const clientProtocol = headers ? getClientProtocol(headers) : 'http';
  const baseURL = resolveBaseURL(resolvedEnv);
  const cookiePolicy = resolveCookiePolicy(baseURL, clientProtocol, resolvedEnv.APP_ENV);
  const trustedRequestOrigin =
    resolvedEnv.APP_ENV === 'development' ? normalizeTrustedOrigin(requestOrigin) : undefined;
  const trustedOrigins = [
    'strength://',
    'strength://*',
    ...(resolvedEnv.APP_ENV === 'development' ? ['http://localhost:*', 'http://127.0.0.1:*'] : []),
    ...parseTrustedOrigins(resolvedEnv.BETTER_AUTH_TRUSTED_ORIGINS),
    ...(baseURL ? [baseURL] : []),
    ...(trustedRequestOrigin ? [trustedRequestOrigin] : []),
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
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    trustedOrigins: Array.from(new Set(trustedOrigins)),
    cookies: {
      secure: cookiePolicy.secure,
      sameSite: cookiePolicy.sameSite,
    },
    plugins: [expo()],
  });
}

export function isDevAuthEnabled(env: WorkerEnv) {
  return resolveWorkerEnv(env).APP_ENV === 'development';
}
