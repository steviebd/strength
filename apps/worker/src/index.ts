import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie } from 'hono/cookie';
import {
  createAuth,
  resolveWorkerEnv,
  type NutritionChatQueueMessage,
  type WorkerEnv,
} from './auth';
import { createDb, populateAuthContext, getAuth } from './api/auth';
import { exchangeCodeForTokens } from './whoop/auth';
import { storeWhoopTokens } from './whoop/token-rotation';
import { getWhoopProfile } from './whoop/api';
import { upsertWhoopProfile, syncAllWhoopData } from './whoop/sync';
import {
  handleWebhookEvent,
  normalizeWhoopWebhookPayload,
  resolveWhoopUserId,
  verifyWebhookSignature,
} from './whoop/webhook';
import {
  decodeWhoopOAuthState,
  buildWhoopCallbackRedirect,
  resolveWhoopRedirectBaseURL,
} from './lib/whoop-oauth';
import {
  checkRateLimit,
  getRateLimitPerHour,
  getRateLimitByEndpoint,
  shouldSkipRateLimit,
} from './lib/rate-limit';
import { eq } from 'drizzle-orm';
import * as schema from '@strength/db';
import { hashPassword } from './auth/password';
import { escapeHtml } from './utils/html';
import { captureEvent } from './lib/posthog';

import healthRouter from './routes/health';
import profileRouter from './routes/profile';
import exercisesRouter from './routes/exercises';
import templatesRouter from './routes/templates';
import workoutsRouter from './routes/workouts';
import programsRouter from './routes/programs';
import programCyclesRouter from './routes/program-cycles';
import whoopRouter from './routes/whoop';
import nutritionRouter from './routes/nutrition';
import homeRouter from './routes/home';
import trainingRouter from './routes/training';
import { processNutritionChatJob } from './api/nutrition/chat';

type Variables = {
  user: ReturnType<typeof createAuth>['$Infer']['Session']['user'] | null;
  session: ReturnType<typeof createAuth>['$Infer']['Session']['session'] | null;
  auth: ReturnType<typeof createAuth> | null;
};

const app = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

const MAX_BODY_SIZE = 1_048_576; // 1 MB

app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > MAX_BODY_SIZE) {
      return c.text('Payload Too Large', 413);
    }
  }
  await next();
});

function parseTrustedOrigins(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedOrigins(env: WorkerEnv): { origins: string[]; baseURLOrigin?: string } {
  const appScheme = env.APP_SCHEME ?? 'strength';
  const origins: string[] = [
    `${appScheme}://`,
    'exp://',
    ...parseTrustedOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS),
  ];
  let baseURLOrigin: string | undefined;
  const baseURL = env.WORKER_BASE_URL;
  if (baseURL) {
    try {
      baseURLOrigin = new URL(baseURL).origin;
      origins.push(baseURLOrigin);
    } catch {}
  }
  return { origins, baseURLOrigin };
}

function isAllowedDevOrigin(origin: string, allowedOrigins: string[]) {
  if (!origin) {
    return true;
  }
  const allowed =
    allowedOrigins.some((o) => origin.startsWith(o)) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^http:\/\/(?:10|192\.168|172\.(?:1[6-9]|2\d|3[0-1]))(?:\.\d{1,3}){2}(?::\d+)?$/i.test(origin);
  return allowed;
}

function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(array);
  }
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isMutatingMethod(method: string): boolean {
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
}

function isNativeResetCallbackURL(callbackURL: string | undefined) {
  if (!callbackURL) {
    return false;
  }

  try {
    const url = new URL(callbackURL);
    return url.protocol === 'exp:' || url.protocol === 'strength:';
  } catch {
    return false;
  }
}

function buildNativeResetURL(callbackURL: string, token: string) {
  const url = new URL(callbackURL);
  url.searchParams.set('token', token);
  return url.toString();
}

function escapeScriptString(value: string) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function buildResetPasswordBridgeHTML(nativeURL: string) {
  const escapedURL = escapeHtml(nativeURL);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open Strength</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0a0a0a;
        color: #f8fafc;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100% - 48px, 420px);
        text-align: center;
      }
      a {
        display: block;
        margin-top: 24px;
        padding: 14px 18px;
        border-radius: 12px;
        background: #22c55e;
        color: #ffffff;
        font-weight: 700;
        text-decoration: none;
      }
      p {
        color: #94a3b8;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Open Strength to reset your password</h1>
      <p>If the app does not open automatically, tap the button below.</p>
      <a href="${escapedURL}">Open Strength</a>
    </main>
    <script>
      window.location.href = ${escapeScriptString(nativeURL)};
    </script>
  </body>
</html>`;
}

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const env = c.env as WorkerEnv;
      const { origins: allowedOrigins, baseURLOrigin } = getAllowedOrigins(env);

      if (!origin) {
        return undefined;
      }

      if (env.APP_ENV === 'development') {
        const isCloudflare = !!c.req.header('cf-connecting-ip');
        if (!isCloudflare && isAllowedDevOrigin(origin, allowedOrigins)) {
          return origin;
        }
        return undefined;
      }

      const strictAllowed = new Set(allowedOrigins);
      if (strictAllowed.has(origin)) {
        return origin;
      }
      if (baseURLOrigin) {
        try {
          if (new URL(origin).origin === baseURLOrigin) {
            return origin;
          }
        } catch {}
      }
      return undefined;
    },
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Set-Cookie'],
    credentials: true,
  }),
);

app.options('/api/*', async (c) => {
  return c.text('', 200);
});

app.use('*', async (c, next) => {
  await populateAuthContext(c);
  await next();
});

// PostHog analytics capture for authenticated API requests
app.use('/api/*', async (c, next) => {
  await next();

  const user = c.get('user');
  if (!user) return;

  const path = c.req.path;
  if (path.startsWith('/api/auth/') || path.startsWith('/api/webhooks/')) return;

  const eventName = c.req.method === 'GET' ? '$pageview' : 'api_request';
  const properties = {
    path,
    method: c.req.method,
    status: c.res.status,
  };

  try {
    c.executionCtx.waitUntil(captureEvent(c.env, user.id, eventName, properties));
  } catch {
    // Silently fail — analytics should not break the API
  }
});

// CSRF protection for state-changing API requests
app.use('/api/*', async (c, next) => {
  if (!isMutatingMethod(c.req.method)) {
    await next();
    return;
  }

  const path = c.req.path;
  if (path.startsWith('/api/auth/') || path.startsWith('/api/webhooks/')) {
    await next();
    return;
  }

  const origin = c.req.header('origin');
  const referer = c.req.header('referer');
  const hasWebOrigin = !!origin || !!referer;

  if (hasWebOrigin) {
    const source = (origin || referer)!;
    const sourceOrigin = (() => {
      try {
        return new URL(source).origin;
      } catch {
        return source;
      }
    })();

    const { origins: allowedOrigins, baseURLOrigin } = getAllowedOrigins(c.env);
    const strictAllowed = new Set([...allowedOrigins, ...(baseURLOrigin ? [baseURLOrigin] : [])]);

    const isAllowed =
      strictAllowed.has(sourceOrigin) ||
      (c.env.APP_ENV === 'development' && isAllowedDevOrigin(sourceOrigin, allowedOrigins));

    if (!isAllowed) {
      return c.json({ message: 'Invalid origin' }, 403);
    }
  }

  const csrfCookie = getCookie(c, 'csrf_token');
  const csrfHeader = c.req.header('x-csrf-token');
  if (hasWebOrigin && csrfCookie && csrfCookie !== csrfHeader) {
    return c.json({ message: 'Invalid CSRF token' }, 403);
  }

  await next();
});

// Global rate limiting (after CORS, before domain routers)
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/auth/whoop/callback' || c.req.path === '/api/webhooks/whoop') {
    await next();
    return;
  }

  if (shouldSkipRateLimit(c.env)) {
    await next();
    return;
  }

  const user = c.get('user');
  const key =
    user?.id ?? c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const db = createDb(c.env);
  const limit = getRateLimitByEndpoint(c.req.path);
  const result = await checkRateLimit(db, key, c.req.path, limit);
  if (!result.allowed) {
    return c.json({ message: 'Rate limit exceeded' }, 429);
  }
  await next();
});

// Check email provider (must be before Better Auth catch-all)
app.post('/api/auth/check-email-provider', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';

  const db = createDb(c.env);
  const key = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const limit = getRateLimitByEndpoint('/api/auth/check-email-provider');
  if (!shouldSkipRateLimit(c.env)) {
    const rateLimitResult = await checkRateLimit(db, key, '/api/auth/check-email-provider', limit);
    if (!rateLimitResult.allowed) {
      return c.json({ message: 'Rate limit exceeded' }, 429);
    }
  }

  const user = email
    ? await db.select().from(schema.user).where(eq(schema.user.email, email)).get()
    : null;

  if (!user) {
    // Dummy hash lookup to prevent timing-based email enumeration
    try {
      await hashPassword('dummy-timing-mitigation');
    } catch {
      // ignore
    }
    return c.json({ hasCredential: false, hasOAuth: false }, 200);
  }

  const accounts = await db
    .select()
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .all();

  const hasCredential = accounts.some((a) => a.providerId === 'credential');
  const hasOAuth = accounts.some((a) => a.providerId !== 'credential');

  return c.json({ hasCredential, hasOAuth }, 200);
});

app.get('/api/auth/reset-password/:token', async (c, next) => {
  const callbackURL = c.req.query('callbackURL');
  if (!isNativeResetCallbackURL(callbackURL)) {
    await next();
    return;
  }

  const token = c.req.param('token');
  const nativeURL = buildNativeResetURL(callbackURL!, token);

  return c.html(buildResetPasswordBridgeHTML(nativeURL));
});

// Better Auth catch-all
app.on(['GET', 'POST'], '/api/auth/*', async (c, next) => {
  if (c.req.path === '/api/auth/whoop/callback') {
    await next();
    return;
  }

  const auth = getAuth(c);
  const response = await auth.handler(c.req.raw);

  return response;
});

// Domain routers
app.route('/api', healthRouter);
app.route('/api/profile', profileRouter);
app.route('/api/exercises', exercisesRouter);
app.route('/api/templates', templatesRouter);
app.route('/api/workouts', workoutsRouter);
app.route('/api/programs', programsRouter);
app.route('/api/programs', programCyclesRouter);
app.route('/api/whoop', whoopRouter);
app.route('/api/nutrition', nutritionRouter);
app.route('/api/home', homeRouter);
app.route('/api/training', trainingRouter);

// CSRF cookie setter for authenticated responses
app.use('/api/*', async (c, next) => {
  await next();

  const path = c.req.path;
  if (path.startsWith('/api/auth/') || path.startsWith('/api/webhooks/')) {
    return;
  }

  const user = c.get('user');
  if (user) {
    const existing = getCookie(c, 'csrf_token');
    if (!existing) {
      setCookie(c, 'csrf_token', generateCsrfToken(), {
        path: '/',
        sameSite: 'Lax',
        secure: c.env.APP_ENV !== 'development',
      });
    }
  }
});

// Cache-Control middleware for read-heavy GET endpoints
app.use('/api/*', async (c, next) => {
  await next();
  if (c.req.method === 'GET') {
    const path = c.req.path;
    const cacheablePrefixes = ['/api/exercises', '/api/programs'];
    const isCacheable =
      cacheablePrefixes.some((prefix) => path.startsWith(prefix)) || path === '/api/home/summary';
    if (isCacheable) {
      c.header('Cache-Control', 'private, max-age=30');
    }
  }
});

// Security headers middleware
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', "default-src 'self'");
});

// WHOOP OAuth landing page (no auth)
app.get('/connect-whoop', (c) => {
  const success = c.req.query('success');
  const error = c.req.query('error');
  const safeError = error ? escapeHtml(error) : undefined;

  const title = success ? 'WHOOP Connected' : 'WHOOP Connection Failed';
  const message = success
    ? 'Your WHOOP account was connected successfully. You can return to the app now.'
    : `The WHOOP connection did not complete.${safeError ? ` Error: ${safeError}` : ''}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1110;
        color: #f5f5f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        padding: 32px;
        border-radius: 24px;
        background: #121918;
        border: 1px solid #26302d;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.24);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: #b7c0bd;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`;

  return c.html(html);
});

// WHOOP OAuth callback (no auth — uses state param)
app.get('/api/auth/whoop/callback', async (c) => {
  const resolvedEnv = resolveWorkerEnv(c.env);
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');
  const decodedState = await decodeWhoopOAuthState(
    resolvedEnv.BETTER_AUTH_SECRET,
    state,
    resolvedEnv,
  );
  const deepLink = decodedState.returnTo ?? 'strength://whoop-callback';

  if (error) {
    return c.redirect(
      buildWhoopCallbackRedirect(deepLink, {
        error: errorDescription ?? error,
      }),
    );
  }

  if (!code) {
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'no_code' }));
  }

  if (!decodedState.userId) {
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'invalid_state' }));
  }

  if (!decodedState.codeVerifier) {
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'missing_code_verifier' }));
  }

  const userId = decodedState.userId;
  const db = createDb(c.env);
  const baseURL = resolveWhoopRedirectBaseURL(resolvedEnv, c.req.url);
  if (!baseURL) {
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'missing_base_url' }));
  }
  const redirectUri = `${baseURL}/api/auth/whoop/callback`;

  if (!shouldSkipRateLimit(resolvedEnv)) {
    const rateLimit = await checkRateLimit(
      db,
      userId,
      'whoop-callback',
      getRateLimitPerHour(resolvedEnv),
    );
    if (!rateLimit.allowed) {
      return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'rate_limited' }));
    }
  }

  try {
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(
        resolvedEnv,
        code,
        redirectUri,
        decodedState.codeVerifier,
      );
    } catch {
      return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'token_exchange_failed' }));
    }

    let whoopProfile;
    try {
      whoopProfile = await getWhoopProfile(tokens.access_token);
    } catch {
      return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'profile_fetch_failed' }));
    }

    await storeWhoopTokens(
      db,
      resolvedEnv,
      userId,
      String(whoopProfile.user_id),
      tokens.access_token,
      tokens.refresh_token,
      new Date(tokens.expires_at!),
      tokens.scope,
    );

    await upsertWhoopProfile(db, userId, whoopProfile);

    const initialSync = Promise.resolve()
      .then(() => syncAllWhoopData(db, resolvedEnv, userId, { isInitialSync: true }))
      .catch((e) => {
        console.warn('WHOOP initial sync failed after OAuth callback', e);
      });
    try {
      c.executionCtx.waitUntil(initialSync);
    } catch {
      // Unit tests and non-Worker adapters may not provide ExecutionContext.
    }

    return c.redirect(buildWhoopCallbackRedirect(deepLink, { success: 'true' }));
  } catch (e) {
    console.warn('WHOOP OAuth callback failed unexpectedly', e);
    return c.redirect(buildWhoopCallbackRedirect(deepLink, { error: 'unknown' }));
  }
});

// WHOOP webhooks (no auth — uses HMAC signature)
app.post('/api/webhooks/whoop', async (c) => {
  const contentLength = c.req.raw.headers.get('content-length');
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > 65_536) {
      return c.json({ error: 'Payload Too Large' }, 413);
    }
  }

  const timestamp = c.req.raw.headers.get('X-WHOOP-Signature-Timestamp') ?? '';
  const signature = c.req.raw.headers.get('X-WHOOP-Signature') ?? '';
  const rawBody = await c.req.raw.text();

  const isValid = await verifyWebhookSignature(c.env, timestamp, signature, rawBody);
  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    const event = normalizeWhoopWebhookPayload(parsedBody);
    if (!event) {
      return c.json({ error: 'Invalid WHOOP webhook payload' }, 400);
    }

    const db = createDb(c.env);
    const userId = await resolveWhoopUserId(db, event.userId);
    if (!userId) {
      return c.json({ success: true, ignored: true }, 202);
    }

    if (!shouldSkipRateLimit(c.env)) {
      const rateLimit = await checkRateLimit(
        db,
        userId,
        'whoop-webhook',
        getRateLimitPerHour(c.env),
      );
      if (!rateLimit.allowed) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
    }

    const result = await handleWebhookEvent(db, c.env, event);

    if (result.success && result.ignored) {
      return c.json({ success: true, ignored: true }, 202);
    } else {
      if (result.success) {
        return c.json({ success: true });
      }

      return c.json({ error: result.error }, 500);
    }
  } catch {
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

app.get('/api/webhooks/whoop', async (c) => {
  return c.json({ ok: true, message: 'WHOOP webhook endpoint active' });
});

async function queue(batch: MessageBatch<NutritionChatQueueMessage>, env: WorkerEnv) {
  for (const message of batch.messages) {
    await processNutritionChatJob(env, message.body);
    message.ack();
  }
}

export default {
  fetch: app.fetch.bind(app),
  queue,
};
