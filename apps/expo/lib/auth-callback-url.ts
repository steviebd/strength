import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const nativeGoogleAuthReturnToKey = 'auth_google_return_to';

function buildCallbackPath(returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/auth/callback?${params.toString()}`;
}

export function buildNativeAuthCallbackURL() {
  return Linking.createURL('/auth/callback');
}

export function buildAuthCallbackURL(returnTo: string) {
  const path = buildCallbackPath(returnTo);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }

  return buildNativeAuthCallbackURL();
}

export { nativeGoogleAuthReturnToKey };
