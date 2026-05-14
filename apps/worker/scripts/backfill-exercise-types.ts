/**
 * Backfill script for Phase 6: exercise types
 *
 * This script generates SQL UPDATE statements based on the exercise library
 * mappings and runs them against the local or remote D1 database via wrangler.
 *
 * Usage:
 *   cd apps/worker && pnpm exec tsx scripts/backfill-exercise-types.ts
 *
 * For remote database:
 *   cd apps/worker && WRANGLER_ENV=production pnpm exec tsx scripts/backfill-exercise-types.ts
 */

import { EXERCISE_TYPE_BY_LIBRARY_ID } from '@strength/db/exercise-library';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DB_NAME = 'strength-db-dev';

function generateBackfillSql(): string {
  const lines: string[] = [];

  lines.push('-- Backfill exercise types, is_amrap, and distance_unit');
  lines.push('');

  // 1. Default all null exercise_type to 'weights'
  lines.push("UPDATE exercises SET exercise_type = 'weights' WHERE exercise_type IS NULL;");
  lines.push('');

  // 2. Map known library exercises to their correct types
  const libraryEntries = Object.entries(EXERCISE_TYPE_BY_LIBRARY_ID);
  for (const [libraryId, exerciseType] of libraryEntries) {
    lines.push(
      `UPDATE exercises SET exercise_type = '${exerciseType}' WHERE libraryId = '${libraryId}';`,
    );
  }
  lines.push('');

  // 3. Ensure is_amrap is false for existing rows that might be NULL
  lines.push('UPDATE exercises SET is_amrap = false WHERE is_amrap IS NULL;');
  lines.push('');

  // 4. Set distance_unit for existing user_preferences
  lines.push("UPDATE user_preferences SET distance_unit = 'km' WHERE distance_unit IS NULL;");
  lines.push('');

  return lines.join('\n');
}

async function runWranglerExecute(sqlPath: string, local = true) {
  const args = local
    ? ['d1', 'execute', DB_NAME, '--local', '--file=' + sqlPath]
    : ['d1', 'execute', DB_NAME, '--file=' + sqlPath];

  console.log(`Running: wrangler ${args.join(' ')}`);

  const proc = Bun.spawn({
    cmd: ['wrangler', ...args],
    cwd: join(import.meta.dir, '..'),
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`wrangler d1 execute exited with code ${exitCode}`);
  }
}

async function main() {
  const isLocal = process.env.WRANGLER_ENV !== 'production';
  const sql = generateBackfillSql();

  const tmpPath = join(import.meta.dir, '..', '.backfill-temp.sql');
  writeFileSync(tmpPath, sql);

  console.log('Generated backfill SQL:');
  console.log(sql);
  console.log('');

  try {
    await runWranglerExecute(tmpPath, isLocal);
    console.log('Backfill completed successfully.');
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  } finally {
    try {
      // Clean up temp file
      const fs = await import('fs/promises');
      await fs.unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

main();
