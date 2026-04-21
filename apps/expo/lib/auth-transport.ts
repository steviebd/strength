import * as Linking from 'expo-linking';
import { getCookie as getExpoCookie } from '@better-auth/expo/client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { platformStorage } from './platform-storage';

export const AUTH_COOKIE_STORAGE_KEY = 'strength_cookie';

export function getNativeOrigin() {
  const rawScheme = Constants.expoConfig?.scheme ?? Constants.platform?.scheme ?? 'strength';
  const scheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;
  return Linking.createURL('', { scheme });
}

export function getStoredAuthCookie() {
  const storedCookie = platformStorage.getItem(AUTH_COOKIE_STORAGE_KEY);
  if (!storedCookie) {
    return null;
  }

  const cookie = getExpoCookie(storedCookie);
  return cookie || null;
}

export function applyAuthRequestHeaders(headers: Headers) {
  if (Platform.OS === 'web') {
    return headers;
  }

  const cookie = getStoredAuthCookie();
  if (cookie) {
    headers.set('cookie', cookie);
  }

  headers.set('expo-origin', getNativeOrigin());
  headers.set('x-skip-oauth-proxy', 'true');

  return headers;
}
