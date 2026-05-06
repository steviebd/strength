import { getSetCookie } from '@better-auth/expo/client';
import { authCookieStorageKey } from '@/lib/auth-client';
import { platformStorage } from '@/lib/platform-storage';

export function persistAuthCallbackCookie(cookieParam: string | string[] | undefined) {
  const cookie = Array.isArray(cookieParam) ? cookieParam[0] : cookieParam;

  if (!cookie) {
    return false;
  }

  const previousCookie = platformStorage.getItem(authCookieStorageKey) ?? undefined;
  platformStorage.setItem(authCookieStorageKey, getSetCookie(cookie, previousCookie));

  return true;
}
