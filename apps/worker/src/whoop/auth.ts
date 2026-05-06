import { resolveWorkerEnv, type WorkerEnv } from '../auth';
import { base64UrlEncode } from '../lib/whoop-oauth';

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';

const WHOOP_SCOPES = [
  'read:workout',
  'read:recovery',
  'read:sleep',
  'read:cycles',
  'read:profile',
  'read:body_measurement',
  'offline',
].join(' ');

export function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(String.fromCharCode(...array));
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(digest)));
}

export function buildWhoopAuthorizationUrl(
  env: WorkerEnv,
  state: string,
  redirectUri: string,
  codeChallenge: string,
): string {
  const resolvedEnv = resolveWorkerEnv(env);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: resolvedEnv.WHOOP_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: WHOOP_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at?: number;
}

export async function exchangeCodeForTokens(
  env: WorkerEnv,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<WhoopTokenResponse> {
  const resolvedEnv = resolveWorkerEnv(env);
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: resolvedEnv.WHOOP_CLIENT_ID!,
    client_secret: resolvedEnv.WHOOP_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    code,
  };
  if (codeVerifier) {
    body.code_verifier = codeVerifier;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WHOOP token exchange failed: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as WhoopTokenResponse & { expires_in: number };
    return {
      ...data,
      expires_at: Date.now() + data.expires_in * 1000,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshAccessToken(
  env: WorkerEnv,
  refreshToken: string,
): Promise<WhoopTokenResponse> {
  const resolvedEnv = resolveWorkerEnv(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: resolvedEnv.WHOOP_CLIENT_ID!,
        client_secret: resolvedEnv.WHOOP_CLIENT_SECRET!,
        refresh_token: refreshToken,
        scope: 'offline',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WHOOP token refresh failed: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as WhoopTokenResponse & { expires_in: number };
    return {
      ...data,
      expires_at: Date.now() + data.expires_in * 1000,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export { WHOOP_API_BASE };
