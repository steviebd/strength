import { resolveWorkerEnv, type WorkerEnv } from '../auth';

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

export function buildWhoopAuthorizationUrl(
  env: WorkerEnv,
  state: string,
  redirectUri: string,
): string {
  const resolvedEnv = resolveWorkerEnv(env);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: resolvedEnv.WHOOP_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: WHOOP_SCOPES,
    state,
  });
  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

export interface WhoopTokenResponse {
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
): Promise<WhoopTokenResponse> {
  const resolvedEnv = resolveWorkerEnv(env);
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: resolvedEnv.WHOOP_CLIENT_ID!,
      client_secret: resolvedEnv.WHOOP_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WHOOP token exchange failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as WhoopTokenResponse & { expires_in: number };
  return {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  env: WorkerEnv,
  refreshToken: string,
): Promise<WhoopTokenResponse> {
  const resolvedEnv = resolveWorkerEnv(env);
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
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WHOOP token refresh failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as WhoopTokenResponse & { expires_in: number };
  return {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export { WHOOP_API_BASE };
