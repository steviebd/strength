import { beforeEach, describe, expect, test, vi } from 'vitest';

const sqlite = {
  withTransactionSync: vi.fn((fn: () => void) => fn()),
};

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: vi.fn(() => sqlite),
}));

vi.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock('./migrations', () => ({
  runLocalMigrations: vi.fn(),
}));

let mockDb: any;

function createMockDb() {
  return {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ run: vi.fn() })),
    })),
  };
}

beforeEach(() => {
  vi.resetModules();
  mockDb = createMockDb();
  vi.clearAllMocks();
});

describe('cleanupStaleLocalData', () => {
  test('deletes nutrition daily summaries older than 7 days', async () => {
    const { cleanupStaleLocalData } = await import('./local-cleanup');
    await cleanupStaleLocalData('user-1');

    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });

  test('deletes WHOOP data older than 7 days', async () => {
    const { cleanupStaleLocalData } = await import('./local-cleanup');
    await cleanupStaleLocalData('user-1');

    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });

  test('returns early when db is unavailable', async () => {
    vi.mocked((await import('drizzle-orm/expo-sqlite')).drizzle).mockReturnValueOnce(null as any);
    const { cleanupStaleLocalData } = await import('./local-cleanup');

    await expect(cleanupStaleLocalData('user-1')).resolves.toBeUndefined();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
