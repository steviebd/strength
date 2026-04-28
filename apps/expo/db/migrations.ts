import type { SQLiteDatabase } from 'expo-sqlite';

export function runLocalMigrations(sqlite: SQLiteDatabase) {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS local_schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL,
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      timezone TEXT,
      bodyweight_kg REAL,
      weight_prompted_at INTEGER,
      server_updated_at INTEGER,
      local_updated_at INTEGER NOT NULL,
      hydrated_from_server_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_timezone_dismissals (
      user_id TEXT NOT NULL,
      device_timezone TEXT NOT NULL,
      dismissed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, device_timezone)
    );

    CREATE TABLE IF NOT EXISTS local_workouts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      template_id TEXT,
      program_cycle_id TEXT,
      cycle_workout_id TEXT,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      notes TEXT,
      total_volume REAL,
      total_sets INTEGER,
      duration_minutes INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'local',
      sync_operation_id TEXT,
      sync_attempt_count INTEGER NOT NULL DEFAULT 0,
      last_sync_error TEXT,
      last_sync_attempt_at INTEGER,
      server_updated_at INTEGER,
      created_locally INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS local_workout_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT,
      order_index INTEGER NOT NULL,
      notes TEXT,
      is_amrap INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_workout_sets (
      id TEXT PRIMARY KEY NOT NULL,
      workout_exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      rpe REAL,
      is_complete INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      notes TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_template_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      template_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT,
      order_index INTEGER NOT NULL,
      target_weight REAL,
      added_weight REAL,
      sets INTEGER,
      reps INTEGER,
      reps_raw TEXT,
      is_amrap INTEGER NOT NULL DEFAULT 0,
      is_accessory INTEGER NOT NULL DEFAULT 0,
      is_required INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS local_user_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT,
      description TEXT,
      library_id TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_program_cycles (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      program_slug TEXT NOT NULL,
      name TEXT NOT NULL,
      current_week INTEGER,
      current_session INTEGER,
      total_sessions_completed INTEGER NOT NULL DEFAULT 0,
      total_sessions_planned INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_program_cycle_workouts (
      id TEXT PRIMARY KEY NOT NULL,
      cycle_id TEXT NOT NULL,
      template_id TEXT,
      week_number INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      session_name TEXT NOT NULL,
      target_lifts TEXT,
      is_complete INTEGER NOT NULL DEFAULT 0,
      workout_id TEXT,
      scheduled_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      available_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_workouts_user_history
      ON local_workouts (user_id, completed_at, started_at);
    CREATE INDEX IF NOT EXISTS idx_local_workout_exercises_workout
      ON local_workout_exercises (workout_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_local_workout_sets_exercise
      ON local_workout_sets (workout_exercise_id, set_number);
    CREATE INDEX IF NOT EXISTS idx_local_sync_queue_runnable
      ON local_sync_queue (status, available_at);
  `);
}
