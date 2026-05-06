import { describe, expect, test, vi } from 'vitest';

const sqlite = {
  withTransactionSync: vi.fn((fn: () => void) => fn()),
};

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: vi.fn(() => sqlite),
}));

vi.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: vi.fn(() => ({})),
}));

vi.mock('./migrations', () => ({
  runLocalMigrations: vi.fn(),
}));

describe('withLocalTransaction', () => {
  test('wraps the callback in expo-sqlite transaction', async () => {
    const { withLocalTransaction } = await import('./client');
    const result = withLocalTransaction(() => 'ok');

    expect(result).toBe('ok');
    expect(sqlite.withTransactionSync).toHaveBeenCalledTimes(1);
  });

  test('does not open nested sqlite transactions', async () => {
    const { withLocalTransaction } = await import('./client');
    sqlite.withTransactionSync.mockClear();

    const result = withLocalTransaction(() => withLocalTransaction(() => 'nested'));

    expect(result).toBe('nested');
    expect(sqlite.withTransactionSync).toHaveBeenCalledTimes(1);
  });
});
