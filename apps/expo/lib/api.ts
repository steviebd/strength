import { Platform } from 'react-native';
import { env } from './env';
import { applyAuthRequestHeaders } from './auth-transport';

type ApiFetchOptions = RequestInit & {
  __stream?: boolean;
};

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
  }).then((res) => {
    if (!res.ok) {
      return res
        .json()
        .then((err) => {
          throw new Error(err.message || `Request failed: ${res.status}`);
        })
        .catch(() => {
          throw new Error(`Request failed: ${res.status}`);
        });
    }
    if (options?.__stream) {
      return res as unknown as Promise<T>;
    }
    return res.json() as Promise<T>;
  });
}
