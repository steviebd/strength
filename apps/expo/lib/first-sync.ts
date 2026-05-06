import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRST_SYNC_KEY_PREFIX = 'first_sync_complete_';

function getKey(userId: string) {
  return `${FIRST_SYNC_KEY_PREFIX}${userId}`;
}

export async function hasCompletedFirstSync(userId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(getKey(userId));
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markFirstSyncComplete(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(getKey(userId), 'true');
  } catch {
    // ignore
  }
}

export async function clearFirstSyncFlag(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(getKey(userId));
  } catch {
    // ignore
  }
}
