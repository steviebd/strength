import { resolveBaseURL } from '../auth';
import type { WorkerEnv } from '../auth';

const WHOOP_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

async function deriveWhoopHMACKey(secret: string) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: encoder.encode('whoop-oauth-state-v1'),
      info: encoder.encode('whoop-state'),
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signWhoopState(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await deriveWhoopHMACKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

export async function encodeWhoopOAuthState(
  secret: string,
  payload: { nonce: string; returnTo?: string; userId: string; codeVerifier?: string },
) {
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      ...payload,
      expiresAt: Date.now() + WHOOP_OAUTH_STATE_TTL_MS,
    }),
  );
  const signature = await signWhoopState(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function decodeWhoopOAuthState(
  secret: string | undefined,
  state: string | undefined,
  env?: WorkerEnv,
): Promise<{
  nonce?: string;
  returnTo?: string;
  userId?: string;
  codeVerifier?: string;
}> {
  if (!state || !secret) {
    return {};
  }

  const [encodedPayload, signature, extra] = state.split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return {};
  }

  const expectedSignature = await signWhoopState(secret, encodedPayload);
  if (signature !== expectedSignature) {
    return {};
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as {
      expiresAt?: number;
      nonce?: string;
      returnTo?: string;
      userId?: string;
      codeVerifier?: string;
    };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
      return {};
    }

    return {
      ...(typeof parsed.nonce === 'string' ? { nonce: parsed.nonce } : {}),
      ...(typeof parsed.returnTo === 'string' && isAllowedWhoopReturnTo(parsed.returnTo, env)
        ? { returnTo: parsed.returnTo }
        : {}),
      ...(typeof parsed.userId === 'string' ? { userId: parsed.userId } : {}),
      ...(typeof parsed.codeVerifier === 'string' ? { codeVerifier: parsed.codeVerifier } : {}),
    };
  } catch {
    return {};
  }
}

export function buildWhoopCallbackRedirect(deepLink: string, params: Record<string, string>) {
  const separator = deepLink.includes('?') ? '&' : '?';
  const query = new URLSearchParams(params).toString();
  return `${deepLink}${separator}${query}`;
}

function getURLOrigin(value: string | undefined) {
  try {
    return value ? new URL(value).origin : undefined;
  } catch {
    return undefined;
  }
}

function isLoopbackOrigin(value: string | undefined) {
  const origin = getURLOrigin(value);
  if (!origin) {
    return false;
  }
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function resolveWhoopRedirectBaseURL(env: WorkerEnv, requestUrl?: string) {
  const configuredBaseURL = resolveBaseURL(env);
  const requestBaseURL = getURLOrigin(requestUrl);

  if (
    env.APP_ENV === 'development' &&
    isLoopbackOrigin(configuredBaseURL) &&
    requestBaseURL &&
    !isLoopbackOrigin(requestBaseURL)
  ) {
    return requestBaseURL;
  }

  return configuredBaseURL;
}

export function isAllowedWhoopRedirectBaseURL(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

export function isAllowedWhoopReturnTo(value: string, env?: WorkerEnv) {
  // Reject raw path traversal patterns before URL normalization
  if (value.includes('..')) {
    return false;
  }
  try {
    const url = new URL(value);

    if (url.protocol === 'https:') {
      const allowedHostnames = new Set(['localhost', '127.0.0.1']);
      if (env) {
        const baseURL = resolveBaseURL(env);
        if (baseURL) {
          try {
            allowedHostnames.add(new URL(baseURL).hostname);
          } catch {
            // ignore invalid base URL
          }
        }
      }
      return allowedHostnames.has(url.hostname);
    }

    if (['strength:', 'exp:', 'exps:'].includes(url.protocol)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
