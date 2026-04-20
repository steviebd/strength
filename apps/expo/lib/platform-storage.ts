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
      removeItem: (key: string): void => {
        if (typeof window === 'undefined') return;
        window.localStorage.removeItem(key);
      },
      getItemAsync: (key: string): Promise<string | null> => {
        return Promise.resolve(platformStorage.getItem(key));
      },
      setItemAsync: (key: string, value: string): Promise<void> => {
        return Promise.resolve(platformStorage.setItem(key, value));
      },
      removeItemAsync: (key: string): Promise<void> => {
        return Promise.resolve(platformStorage.removeItem(key));
      },
    }
  : {
      getItem: (key: string): string | null => {
        return SecureStore.getItem(key);
      },
      setItem: (key: string, value: string): void => {
        SecureStore.setItem(key, value);
      },
      removeItem: (key: string): void => {
        SecureStore.deleteItem(key);
      },
      getItemAsync: (key: string): Promise<string | null> => {
        return SecureStore.getItemAsync(key);
      },
      setItemAsync: (key: string, value: string): Promise<void> => {
        return SecureStore.setItemAsync(key, value);
      },
      removeItemAsync: (key: string): Promise<void> => {
        return SecureStore.deleteItemAsync(key);
      },
    };
