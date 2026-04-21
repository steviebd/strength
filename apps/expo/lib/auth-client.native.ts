import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { env } from '@/lib/env';
import { platformStorage } from '@/lib/platform-storage';

export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  plugins: [
    expoClient({
      scheme: 'strength',
      storagePrefix: 'strength',
      storage: platformStorage,
      cookiePrefix: 'better-auth',
    }),
  ],
  fetchOptions: {
    onError: (context) => {
      const isGetSession401 =
        context.request.url.toString().includes('/get-session') && context.error.status === 401;
      if (!isGetSession401) {
        console.warn('[Better Auth]', context.error.message);
      }
    },
  },
});
