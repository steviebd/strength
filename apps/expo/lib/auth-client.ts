import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { env } from '@/lib/env';
import { platformStorage } from '@/lib/platform-storage';

const COOKIE_NAME = 'strength_cookie';
const LOCAL_CACHE_NAME = 'strength_session_data';

export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  plugins: [
    expoClient({
      scheme: env.appScheme,
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

export function debugAuthState() {
  const raw = platformStorage.getItem(COOKIE_NAME);
  console.log('[Auth Debug] Raw storage cookie:', raw);
  const cached = platformStorage.getItem(LOCAL_CACHE_NAME);
  console.log('[Auth Debug] Cached session:', cached);
}
