import { beforeEach, describe, expect, test, vi } from 'vitest';

const storage: Record<string, string> = {};

vi.mock('./platform-storage', () => ({
  platformStorage: {
    getItem: (key: string): string | null => storage[key] ?? null,
    setItem: (key: string, value: string): void => {
      storage[key] = value;
    },
    removeItem: (key: string): void => {
      delete storage[key];
    },
  },
}));

vi.mock('../db/client', () => ({
  getLocalDb: vi.fn(() => null),
}));

vi.mock('../db/local-schema', () => ({
  localPendingWorkouts: {},
}));

beforeEach(() => {
  Object.keys(storage).forEach((key) => delete storage[key]);
  vi.resetModules();
});

describe('setNutritionChatMessages', () => {
  test('caps messages at 20 items', async () => {
    const { setNutritionChatMessages, getNutritionChatMessages } = await import('./storage');
    const messages = Array.from({ length: 25 }, (_, i) => ({ id: `msg-${i}` }));

    await setNutritionChatMessages('2024-01-01', messages);
    const cached = await getNutritionChatMessages<{ id: string }>('2024-01-01');

    expect(cached).toHaveLength(20);
    expect(cached[0].id).toBe('msg-5');
    expect(cached[19].id).toBe('msg-24');
  });

  test('stores fewer than 20 messages as-is', async () => {
    const { setNutritionChatMessages, getNutritionChatMessages } = await import('./storage');
    const messages = [{ id: 'msg-1' }, { id: 'msg-2' }];

    await setNutritionChatMessages('2024-01-01', messages);
    const cached = await getNutritionChatMessages<{ id: string }>('2024-01-01');

    expect(cached).toHaveLength(2);
  });
});

describe('nutrition pending image storage', () => {
  test('stores and retrieves an image via platformStorage', async () => {
    const { setNutritionPendingImage, getNutritionPendingImage } = await import('./storage');
    const image = { base64: 'data:image/png;base64,abc', uri: 'file:///tmp/photo.jpg' };

    await setNutritionPendingImage('2024-01-01', image);
    const result = await getNutritionPendingImage('2024-01-01');

    expect(result).toEqual(image);
  });

  test('removes image when set to null', async () => {
    const { setNutritionPendingImage, getNutritionPendingImage } = await import('./storage');
    const image = { base64: 'data:image/png;base64,abc', uri: 'file:///tmp/photo.jpg' };

    await setNutritionPendingImage('2024-01-01', image);
    await setNutritionPendingImage('2024-01-01', null);
    const result = await getNutritionPendingImage('2024-01-01');

    expect(result).toBeNull();
  });

  test('removeNutritionPendingImage deletes the key', async () => {
    const { setNutritionPendingImage, removeNutritionPendingImage, getNutritionPendingImage } =
      await import('./storage');
    const image = { base64: 'data:image/png;base64,abc', uri: 'file:///tmp/photo.jpg' };

    await setNutritionPendingImage('2024-01-01', image);
    await removeNutritionPendingImage('2024-01-01');
    const result = await getNutritionPendingImage('2024-01-01');

    expect(result).toBeNull();
  });

  test('returns null for missing image', async () => {
    const { getNutritionPendingImage } = await import('./storage');
    const result = await getNutritionPendingImage('2024-01-01');

    expect(result).toBeNull();
  });
});
