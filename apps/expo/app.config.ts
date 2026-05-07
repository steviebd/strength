import type { ExpoConfig } from 'expo/config';

const appName = process.env.APP_NAME || 'strength';
const bundleSuffix = process.env.APP_BUNDLE_SUFFIX || '';
const scheme = process.env.EXPO_PUBLIC_APP_SCHEME || 'strength';

const config: ExpoConfig = {
  name: appName,
  slug: 'strength',
  scheme,
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0a0a0a',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-background-task',
      {
        minimumInterval: 900,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  android: {
    package: `com.strength.app${bundleSuffix}`,
    jsEngine: 'hermes',
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0a0a0a',
    },
    permissions: ['RECEIVE_BOOT_COMPLETED'],
  },
  ios: {
    bundleIdentifier: `com.strength.app${bundleSuffix}`,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    router: {},
    eas: {
      projectId: 'c874ac48-018b-4ad3-9391-51243cc1c5bd',
    },
  },
};

export default config;
