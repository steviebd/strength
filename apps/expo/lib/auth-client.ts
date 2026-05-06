import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { dashClient } from '@better-auth/infra/native';
import { env } from '@/lib/env';
import { platformStorage } from '@/lib/platform-storage';

export const authStoragePrefix = 'strength';
export const authCookieStorageKey = `${authStoragePrefix}_cookie`;

export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  plugins: [
    expoClient({
      scheme: env.appScheme,
      storagePrefix: authStoragePrefix,
      storage: platformStorage,
      cookiePrefix: 'better-auth',
    }),
    dashClient(),
  ],
  fetchOptions: {
    onError: (context) => {
      const isGetSession401 =
        context.request.url.toString().includes('/get-session') && context.error.status === 401;
      if (!isGetSession401) {
        // no-op
      }
    },
  },
});
