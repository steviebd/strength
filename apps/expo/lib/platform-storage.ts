import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

export const platformStorage = isWeb
  ? {
      getItem: (key: string): string | null => {
        if (typeof window === 'undefined') return null;
        return window.localStorage.getItem(key);
      },
      setItem: (key: string, value: string): void => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(key, value);
      },
    }
  : {
      getItem: (key: string): string | null => {
        return SecureStore.getItem(key);
      },
      setItem: (key: string, value: string): void => {
        SecureStore.setItem(key, value);
      },
    };
