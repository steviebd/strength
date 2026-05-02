import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSource = readFileSync(resolve(__dirname, 'migrations.ts'), {
  encoding: 'utf8',
});

describe('local migration performance indexes', () => {
  test('declares indexes for high-traffic local reads and writes', () => {
    expect(migrationSource).toContain('idx_local_workout_sets_exercise_deleted_order');
    expect(migrationSource).toContain('idx_local_sync_queue_user_runnable');
    expect(migrationSource).toContain('idx_local_workout_exercises_lower_name');
  });

  test('wraps versioned migrations in a transaction', () => {
    expect(migrationSource).toContain('sqlite.withTransactionSync');
  });
});
