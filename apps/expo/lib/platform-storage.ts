import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

const createSecureStoreStorage = () => ({
  getItem: (key: string): string | null => {
    try {
      const result = SecureStore.getItem(key);
      return result as string | null;
    } catch (e) {
      console.error(`[platform-storage] Failed to get ${key} from SecureStore:`, e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      SecureStore.setItem(key, value);
    } catch (e) {
      console.error(`[platform-storage] Failed to set ${key} in SecureStore:`, e);
    }
  },
  removeItem: (key: string): void => {
    try {
      SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.error(`[platform-storage] Failed to remove ${key} from SecureStore:`, e);
    }
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
});

const createWebStorage = () => ({
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
    return Promise.resolve(createWebStorage().getItem(key));
  },
  setItemAsync: (key: string, value: string): Promise<void> => {
    return Promise.resolve(createWebStorage().setItem(key, value));
  },
  removeItemAsync: (key: string): Promise<void> => {
    return Promise.resolve(createWebStorage().removeItem(key));
  },
});

export const platformStorage = isWeb ? createWebStorage() : createSecureStoreStorage();
