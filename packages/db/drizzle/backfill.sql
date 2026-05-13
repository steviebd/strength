-- Backfill script for Phase 6: exercise types
-- Run against your D1 database via wrangler:
--   wrangler d1 execute strength-db-dev-remote --file=packages/db/drizzle/backfill.sql
-- Or for local dev:
--   wrangler d1 execute strength-db-dev-remote --local --file=packages/db/drizzle/backfill.sql

-- 1. Set default exercise_type for all existing exercises that don't have one.
--    Exercises with a libraryId will be updated below.
UPDATE exercises
SET exercise_type = 'weighted'
WHERE exercise_type IS NULL;

-- 2. Set is_amrap = false for all existing exercises (column was added with default false,
--    but existing rows may have NULL in some SQLite versions)
UPDATE exercises
SET is_amrap = false
WHERE is_amrap IS NULL;

-- 3. Set distance_unit default for existing user_preferences rows that don't have it.
UPDATE user_preferences
SET distance_unit = 'km'
WHERE distance_unit IS NULL;

-- 4. (Optional) If you want to map library exercises to their correct types,
--    run the TypeScript script in apps/worker/scripts/backfill-exercise-types.ts
--    instead, or manually update specific library IDs here:
-- UPDATE exercises
-- SET exercise_type = 'bodyweight'
-- WHERE libraryId IN ('push-ups', 'pull-ups', 'chest-dips', 'tricep-dips', 'burpees');
-- UPDATE exercises
-- SET exercise_type = 'timed'
-- WHERE libraryId IN ('plank', 'hanging-leg-raise', 'cable-crunch', 'back-raises', 'hyperextensions');
-- UPDATE exercises
-- SET exercise_type = 'cardio'
-- WHERE libraryId IN ('treadmill', 'rowing-machine', 'stationary-bike');
-- UPDATE exercises
-- SET exercise_type = 'plyo'
-- WHERE libraryId IN ('box-jump');
