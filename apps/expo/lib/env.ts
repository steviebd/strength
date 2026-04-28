import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getExpoHost() {
  const hostUri = Constants.expoConfig?.hostUri;

  if (!hostUri) {
    return null;
  }

  return hostUri.split(':')[0] ?? null;
}

function resolveApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_WORKER_BASE_URL;

  if (!configuredUrl) {
    throw new Error('[env] Missing required: EXPO_PUBLIC_WORKER_BASE_URL');
  }

  if (Platform.OS === 'web') {
    const resolved = configuredUrl.replace(/\/$/, '');
    return resolved;
  }

  const expoHost = getExpoHost();

  if (!expoHost) {
    return configuredUrl;
  }

  try {
    const url = new URL(configuredUrl);

    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      url.hostname = expoHost;
    }

    const resolved = url.toString().replace(/\/$/, '');
    return resolved;
  } catch {
    return configuredUrl;
  }
}

export const env = {
  apiUrl: resolveApiUrl(),
  appScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? 'strength',
};
