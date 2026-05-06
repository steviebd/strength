import { authClient } from './auth-client';
import { assertAppConfigured, env } from './env';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  __stream?: boolean;
  body?: BodyInit | Record<string, unknown>;
};

function normalizeBody(body: ApiFetchOptions['body']): ApiFetchOptions['body'] {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function serializeFetchBody(body: ApiFetchOptions['body']): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (
    typeof body === 'string' ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer)
  ) {
    return body;
  }

  return JSON.stringify(body);
}

function getNativeAuthHeaders(): HeadersInit {
  if (Platform.OS === 'web') {
    return {};
  }

  const getCookie = (authClient as unknown as { getCookie?: () => string | null }).getCookie;
  const cookie = getCookie?.();

  return {
    ...(cookie ? { cookie } : {}),
    'expo-origin': Linking.createURL('', { scheme: env.appScheme }),
    'x-skip-oauth-proxy': 'true',
  };
}

function resolveApiUrl(endpoint: string): string {
  const isRelative = !endpoint.startsWith('http');
  return isRelative ? `${env.apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}` : endpoint;
}

async function apiFetchStream(endpoint: string, options: ApiFetchOptions): Promise<Response> {
  assertAppConfigured();

  const url = resolveApiUrl(endpoint);
  const headers = new Headers(options.headers);
  const body = serializeFetchBody(normalizeBody(options.body));

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  for (const [key, value] of Object.entries(getNativeAuthHeaders())) {
    headers.set(key, value);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body,
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.clone().json()) as { message?: unknown; error?: unknown };
      const serverMessage = payload.message ?? payload.error;
      if (typeof serverMessage === 'string' && serverMessage.trim()) {
        message = serverMessage;
      }
    } catch {}
    throw new ApiError(message, response.status, response.statusText);
  }

  return response;
}

export async function apiFetch<T>(endpoint: string, options?: ApiFetchOptions): Promise<T> {
  assertAppConfigured();

  const url = resolveApiUrl(endpoint);

  const normalizedOptions = options ? { ...options, body: normalizeBody(options.body) } : options;

  if (normalizedOptions?.__stream) {
    return apiFetchStream(endpoint, normalizedOptions) as Promise<T>;
  }

  const result = await authClient.$fetch(url, normalizedOptions as RequestInit);

  if (result.error) {
    const message =
      'message' in result.error
        ? String(result.error.message)
        : (result.error.statusText ?? `Request failed: ${result.error.status}`);
    throw new ApiError(message, result.error.status, result.error.statusText);
  }

  if (result.data === null && result.error === null) {
    return null as T;
  }

  if (!result.data || (typeof result.data === 'string' && !result.data.trim())) {
    return null as T;
  }

  return result.data as T;
}
