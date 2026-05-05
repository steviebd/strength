import { expo } from '@better-auth/expo';
import { dash } from '@better-auth/infra';
import { betterAuth } from 'better-auth/minimal';
import type { BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@strength/db';
import { hashPassword, verifyPassword } from './auth/password';

export interface WorkerEnv {
  DB: D1Database;
  NUTRITION_CHAT_QUEUE?: Queue<NutritionChatQueueMessage>;
  BETTER_AUTH_SECRET: string;
  WORKER_BASE_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  APP_ENV?: string;
  APP_SCHEME?: string;
  BETTER_AUTH_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_NAME?: string;
  AI_MODEL_NAME?: string;
  CF_AI_GATEWAY_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
  WHOOP_CLIENT_ID?: string;
  WHOOP_CLIENT_SECRET?: string;
  WHOOP_WEBHOOK_SECRET?: string;
  ENCRYPTION_MASTER_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RATE_LIMIT_REQUEST_PER_HOUR?: string;
}

export interface NutritionChatQueueMessage {
  jobId: string;
}

type SameSitePolicy = 'strict' | 'lax' | 'none';

export const SESSION_EXPIRES_IN_SECONDS = 10 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60;
export const SESSION_COOKIE_CACHE_MAX_AGE_SECONDS = 5 * 60;

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

export function resolveCookiePolicy(
  baseURL: string | undefined,
  clientProtocol: 'https' | 'http',
  appEnv?: string,
): {
  secure: boolean;
  sameSite: SameSitePolicy;
} {
  const baseURLIsHttps = baseURL?.startsWith('https://');
  const isDevMode = appEnv === 'development';

  if (isDevMode && baseURLIsHttps) {
    return {
      secure: true,
      sameSite: 'none',
    };
  }

  if (!isDevMode && baseURLIsHttps) {
    return {
      secure: true,
      sameSite: 'lax',
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
    APP_SCHEME: env.APP_SCHEME ?? processEnv.APP_SCHEME,
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
    BETTER_AUTH_API_KEY: env.BETTER_AUTH_API_KEY ?? processEnv.BETTER_AUTH_API_KEY,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? processEnv.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? processEnv.GOOGLE_CLIENT_SECRET,
  };
}

export function resolveBaseURL(env: WorkerEnv) {
  const resolvedEnv = resolveWorkerEnv(env);
  const configuredBaseURL = normalizeBaseURL(resolvedEnv.WORKER_BASE_URL);

  return configuredBaseURL;
}

export function createAuth(env: WorkerEnv, headers?: Headers, requestOrigin?: string) {
  const resolvedEnv = resolveWorkerEnv(env);
  if (resolvedEnv.APP_ENV !== 'development') {
    if (!resolvedEnv.WORKER_BASE_URL || !resolvedEnv.WORKER_BASE_URL.startsWith('https://')) {
      throw new Error(
        'WORKER_BASE_URL must be set and start with https:// in non-development environments',
      );
    }
  }
  const db = drizzle(resolvedEnv.DB, { schema });
  const clientProtocol = headers ? getClientProtocol(headers) : 'http';
  const baseURL = resolveBaseURL(resolvedEnv);
  const cookiePolicy = resolveCookiePolicy(baseURL, clientProtocol, resolvedEnv.APP_ENV);
  const trustedRequestOrigin =
    resolvedEnv.APP_ENV === 'development' ? normalizeTrustedOrigin(requestOrigin) : undefined;
  const appScheme = resolvedEnv.APP_SCHEME ?? 'strength';
  const trustedOrigins = [
    `${appScheme}://`,
    `${appScheme}://*`,
    `${appScheme}:///`,
    `${appScheme}:///*`,
    'exp://',
    'exp://*',
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
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
      },
    },
    trustedOrigins: Array.from(new Set(trustedOrigins)),
    advanced: {
      useSecureCookies: cookiePolicy.secure,
      defaultCookieAttributes: {
        secure: cookiePolicy.secure,
        sameSite: cookiePolicy.sameSite,
      },
    },
    socialProviders:
      resolvedEnv.GOOGLE_CLIENT_ID && resolvedEnv.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: resolvedEnv.GOOGLE_CLIENT_ID,
              clientSecret: resolvedEnv.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    plugins: [expo(), dash({ apiKey: resolvedEnv.BETTER_AUTH_API_KEY }) as BetterAuthPlugin],
  });
}
