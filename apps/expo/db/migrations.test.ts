import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runLocalMigrations } from './migrations';

const migrationSource = readFileSync(resolve(__dirname, 'migrations.ts'), {
  encoding: 'utf8',
});

function createSqliteMock() {
  const columnsByTable = new Map<string, Set<string>>();
  const execStatements: string[] = [];

  const sqlite = {
    execSync: vi.fn((sql: string) => {
      execStatements.push(sql);
      const alterMatch = sql.match(/^ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
      if (alterMatch) {
        const [, tableName, columnName] = alterMatch;
        const columns = columnsByTable.get(tableName) ?? new Set<string>();
        columns.add(columnName);
        columnsByTable.set(tableName, columns);
      }
    }),
    getAllSync: vi.fn((sql: string) => {
      const pragmaMatch = sql.match(/^PRAGMA table_info\((\w+)\)/i);
      if (pragmaMatch) {
        return Array.from(columnsByTable.get(pragmaMatch[1]) ?? []).map((name) => ({ name }));
      }
      return [];
    }),
    withTransactionSync: vi.fn((fn: () => void) => fn()),
  };

  return { sqlite, execStatements };
}

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

describe('runLocalMigrations', () => {
  test('backfills local workout session columns before creating local indexes', () => {
    const { sqlite, execStatements } = createSqliteMock();

    runLocalMigrations(sqlite as any);

    const firstIndex = execStatements.findIndex((sql) => sql.includes('CREATE INDEX'));
    const workoutExerciseBackfill = execStatements.findIndex((sql) =>
      sql.includes('ALTER TABLE local_workout_exercises ADD COLUMN is_deleted'),
    );
    const workoutSetBackfill = execStatements.findIndex((sql) =>
      sql.includes('ALTER TABLE local_workout_sets ADD COLUMN is_deleted'),
    );

    expect(workoutExerciseBackfill).toBeGreaterThan(-1);
    expect(workoutSetBackfill).toBeGreaterThan(-1);
    expect(firstIndex).toBeGreaterThan(workoutExerciseBackfill);
    expect(firstIndex).toBeGreaterThan(workoutSetBackfill);
  });
});
