import { authClient } from './auth-client';
import { env } from './env';

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

export async function apiFetch<T>(endpoint: string, options?: ApiFetchOptions): Promise<T> {
  const isRelative = !endpoint.startsWith('http');
  const url = isRelative
    ? `${env.apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
    : endpoint;

  if (options?.__stream) {
    return authClient.$fetch(url, options as RequestInit) as Promise<T>;
  }

  const result = await authClient.$fetch(url, options as RequestInit);

  if (result.error) {
    const message =
      'message' in result.error
        ? String(result.error.message)
        : (result.error.statusText ?? `Request failed: ${result.error.status}`);
    throw new ApiError(message, result.error.status, result.error.statusText);
  }

  if (result.data === null && result.error === null) {
    return undefined as T;
  }

  if (!result.data || (typeof result.data === 'string' && !result.data.trim())) {
    return undefined as T;
  }

  return result.data as T;
}
