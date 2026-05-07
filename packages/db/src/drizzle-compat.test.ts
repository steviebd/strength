import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = new URL('../../../', import.meta.url).pathname;

function readInstalledType(path: string) {
  return readFileSync(join(repoRoot, 'node_modules', path), 'utf8');
}

describe('drizzle driver compatibility guardrails', () => {
  test('D1 driver is async and exposes batch', () => {
    const driverTypes = readInstalledType('drizzle-orm/d1/driver.d.ts');
    const sessionTypes = readInstalledType('drizzle-orm/d1/session.d.ts');

    expect(driverTypes).toContain("BaseSQLiteDatabase<'async'");
    expect(driverTypes).toContain('batch<');
    expect(sessionTypes).toContain("SQLiteSession<'async'");
    expect(sessionTypes).toContain('transaction<T>');
  });

  test('Expo SQLite drizzle driver is sync and has no db batch API', () => {
    const driverTypes = readInstalledType('drizzle-orm/expo-sqlite/driver.d.ts');
    const sessionTypes = readInstalledType('drizzle-orm/expo-sqlite/session.d.ts');

    expect(driverTypes).toContain("BaseSQLiteDatabase<'sync'");
    expect(driverTypes).not.toContain('batch<');
    expect(sessionTypes).toContain("SQLiteSession<'sync'");
    expect(sessionTypes).toContain('transaction<T>');
  });
});
