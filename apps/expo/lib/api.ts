import { Platform } from 'react-native';
import { env } from './env';
import { applyAuthRequestHeaders } from './auth-transport';

type ApiFetchOptions = RequestInit & {
  __stream?: boolean;
};

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

export function apiFetch<T = unknown>(endpoint: string, options?: ApiFetchOptions): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${env.apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const isNative = Platform.OS !== 'web';

  const headers = applyAuthRequestHeaders(new Headers(options?.headers));

  if (!headers.has('Content-Type') && options?.body) {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!isFormData) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: isNative ? 'omit' : 'include',
  }).then(async (res) => {
    if (!res.ok) {
      let details: unknown = null;
      try {
        details = await res.json();
      } catch {}

      const message =
        details && typeof details === 'object' && 'message' in details
          ? String((details as { message?: unknown }).message)
          : `Request failed: ${res.status}`;

      throw new ApiError(message, res.status, details);
    }
    if (options?.__stream) {
      return res as unknown as Promise<T>;
    }
    return res.json() as Promise<T>;
  });
}
