import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { env } from '@/lib/env';

export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  plugins: [
    expoClient({
      scheme: 'strength',
      storagePrefix: 'strength',
      storage: SecureStore,
      cookiePrefix: 'better-auth',
    }),
  ],
});
