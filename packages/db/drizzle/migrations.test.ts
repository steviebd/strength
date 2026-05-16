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

    expect(sql).toContain('idx_workouts_user_deleted_started_at');
    expect(sql).toContain('idx_workouts_user_deleted_completed_at');
    expect(sql).toContain('idx_workout_sets_exercise_set_number');
    expect(sql).toContain('idx_exercises_user_deleted_lower_name');
    expect(sql).toContain('idx_templates_user_deleted_created_at');
  });

  test('contains uniqueness needed for safe user/provider upserts', () => {
    const sql = allMigrationSql();

    expect(sql).toContain('user_integration_user_id_provider_unique');
    expect(sql).toContain('user_integration_provider_provider_user_id_unique');
  });
});
