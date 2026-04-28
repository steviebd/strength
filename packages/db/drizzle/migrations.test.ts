import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = new URL('./migrations', import.meta.url);

function allMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(migrationsDir.pathname, file), 'utf8'))
    .join('\n');
}

describe('migration guardrails', () => {
  test('contains declared performance indexes for high-traffic tables', () => {
    const sql = allMigrationSql();

    expect(sql).toContain('idx_workouts_user_id_started_at');
    expect(sql).toContain('idx_workout_sets_workout_exercise_id');
    expect(sql).toContain('idx_nutrition_entries_user_logged_at');
    expect(sql).toContain('idx_rate_limit_user_id_endpoint');
  });

  test('contains uniqueness needed for safe user/provider upserts', () => {
    const sql = allMigrationSql();

    expect(sql).toContain('user_integration_user_id_provider_unique');
    expect(sql).toContain('user_integration_provider_provider_user_id_unique');
  });
});
