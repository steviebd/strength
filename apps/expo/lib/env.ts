import Constants from 'expo-constants';
import { Platform } from 'react-native';

const missingWorkerBaseUrlMessage =
  'Missing required build-time value: EXPO_PUBLIC_WORKER_BASE_URL';

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
    return {
      apiUrl: 'http://127.0.0.1:8787',
      configError: missingWorkerBaseUrlMessage,
    };
  }

  if (Platform.OS === 'web') {
    const resolved = configuredUrl.replace(/\/$/, '');
    return { apiUrl: resolved, configError: null };
  }

  const expoHost = getExpoHost();

  if (!expoHost) {
    return { apiUrl: configuredUrl, configError: null };
  }

  try {
    const url = new URL(configuredUrl);

    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      url.hostname = expoHost;
    }

    const resolved = url.toString().replace(/\/$/, '');
    return { apiUrl: resolved, configError: null };
  } catch {
    return { apiUrl: configuredUrl, configError: null };
  }
}

const resolvedApi = resolveApiUrl();

export const env = {
  apiUrl: resolvedApi.apiUrl,
  configError: resolvedApi.configError,
  appScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? 'strength',
};

export function assertAppConfigured() {
  if (env.configError) {
    throw new Error(env.configError);
  }
}
