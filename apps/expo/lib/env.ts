/* oxlint-disable no-unused-vars */
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
    console.log('API URL (web):', resolved);
    return resolved;
  }

  const expoHost = getExpoHost();

  if (!expoHost) {
    console.log('API URL (no expo host):', configuredUrl);
    return configuredUrl;
  }

  try {
    const url = new URL(configuredUrl);

    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      url.hostname = expoHost;
    }

    const resolved = url.toString().replace(/\/$/, '');
    console.log('API URL (resolved):', resolved, 'expoHost:', expoHost);
    return resolved;
  } catch (_e) {
    console.log('API URL (fallback):', configuredUrl);
    return configuredUrl;
  }
}

export const env = {
  apiUrl: resolveApiUrl(),
};
