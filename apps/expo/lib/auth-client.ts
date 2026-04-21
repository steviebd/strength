import { createAuthClient } from 'better-auth/react';
import { env } from '@/lib/env';

export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  fetchOptions: {
    onError: (context) => {
      const urlStr =
        context.request.url instanceof URL ? context.request.url.href : context.request.url;
      const isGetSession401 = urlStr.includes('/get-session') && context.error.status === 401;
      if (!isGetSession401) {
        console.warn('[Better Auth]', context.error.message);
      }
    },
  },
});
