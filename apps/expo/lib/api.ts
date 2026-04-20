import { env } from './env';
import { authClient } from './auth-client';

export function apiFetch<T = unknown>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${env.apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = new Headers(options?.headers);
  if ('getCookie' in authClient) {
    const cookie = authClient.getCookie();
    if (cookie) {
      headers.set('Cookie', cookie);
    }
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
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
    return res.json() as Promise<T>;
  });
}
