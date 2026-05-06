import { enqueueSyncItem } from '@/db/sync-queue';

export class OfflineError extends Error {
  constructor(message = 'Saved locally. Will sync when online.') {
    super(message);
    this.name = 'OfflineError';
  }
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error && error.message === 'Network request failed') {
    return true;
  }
  return false;
}

export async function tryOnlineOrEnqueue<T>(options: {
  apiCall: () => Promise<T>;
  userId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: unknown;
  onEnqueue?: () => Promise<void>;
}): Promise<T> {
  try {
    return await options.apiCall();
  } catch (error) {
    if (isNetworkError(error)) {
      await enqueueSyncItem(
        options.userId,
        options.entityType,
        options.entityId,
        options.operation,
        options.payload,
      );
      await options.onEnqueue?.();
      throw new OfflineError();
    }
    throw error;
  }
}
