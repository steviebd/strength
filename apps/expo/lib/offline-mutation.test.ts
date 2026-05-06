import { beforeEach, describe, expect, test, vi } from 'vitest';

const MockApiError = vi.hoisted(() => {
  return class MockApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public details: unknown,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  };
});

vi.mock('./api', () => ({
  ApiError: MockApiError,
}));

vi.mock('@/db/sync-queue', () => ({
  enqueueSyncItem: vi.fn(),
}));

import { enqueueSyncItem } from '@/db/sync-queue';
import { OfflineError, isNetworkError, tryOnlineOrEnqueue } from './offline-mutation';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OfflineError', () => {
  test('has correct name and default message', () => {
    const error = new OfflineError();
    expect(error.name).toBe('OfflineError');
    expect(error.message).toBe('Saved locally. Will sync when online.');
  });

  test('accepts custom message', () => {
    const error = new OfflineError('custom msg');
    expect(error.message).toBe('custom msg');
  });
});

describe('isNetworkError', () => {
  test('returns true for "Network request failed"', () => {
    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
  });

  test('returns false for ApiError with status >= 500', () => {
    expect(isNetworkError(new MockApiError('fail', 500, 'err'))).toBe(false);
    expect(isNetworkError(new MockApiError('fail', 503, 'err'))).toBe(false);
  });

  test('returns false for ApiError with status < 500', () => {
    expect(isNetworkError(new MockApiError('fail', 400, 'err'))).toBe(false);
    expect(isNetworkError(new MockApiError('fail', 404, 'err'))).toBe(false);
  });

  test('returns false for non-Error values', () => {
    expect(isNetworkError('string')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('tryOnlineOrEnqueue', () => {
  test('returns api result on success', async () => {
    const result = await tryOnlineOrEnqueue({
      apiCall: () => Promise.resolve(42),
      userId: 'u1',
      entityType: 'test',
      entityId: 'e1',
      operation: 'op',
      payload: {},
    });
    expect(result).toBe(42);
  });

  test('throws OfflineError and enqueues on network error', async () => {
    vi.mocked(enqueueSyncItem).mockResolvedValue('id');
    const apiCall = vi.fn().mockRejectedValue(new Error('Network request failed'));

    await expect(
      tryOnlineOrEnqueue({
        apiCall,
        userId: 'u1',
        entityType: 'test',
        entityId: 'e1',
        operation: 'op',
        payload: { foo: 1 },
      }),
    ).rejects.toThrow(OfflineError);

    expect(enqueueSyncItem).toHaveBeenCalledWith('u1', 'test', 'e1', 'op', { foo: 1 });
  });

  test('calls onEnqueue when enqueuing', async () => {
    vi.mocked(enqueueSyncItem).mockResolvedValue('id');
    const onEnqueue = vi.fn().mockResolvedValue(undefined);
    const apiCall = vi.fn().mockRejectedValue(new Error('Network request failed'));

    await expect(
      tryOnlineOrEnqueue({
        apiCall,
        userId: 'u1',
        entityType: 'test',
        entityId: 'e1',
        operation: 'op',
        payload: {},
        onEnqueue,
      }),
    ).rejects.toThrow(OfflineError);

    expect(onEnqueue).toHaveBeenCalled();
  });

  test('re-throws non-network errors without enqueuing', async () => {
    const apiCall = vi.fn().mockRejectedValue(new Error('Bad request'));

    await expect(
      tryOnlineOrEnqueue({
        apiCall,
        userId: 'u1',
        entityType: 'test',
        entityId: 'e1',
        operation: 'op',
        payload: {},
      }),
    ).rejects.toThrow('Bad request');

    expect(enqueueSyncItem).not.toHaveBeenCalled();
  });
});
