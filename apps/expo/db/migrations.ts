import type { SQLiteDatabase } from 'expo-sqlite';

type TableColumn = { name: string };

const WORKOUT_TYPE_TRAINING = 'training';
const WORKOUT_TYPE_ONE_RM_TEST = 'one_rm_test';

function getColumnNames(sqlite: SQLiteDatabase, tableName: string) {
  try {
    return new Set(
      sqlite.getAllSync<TableColumn>(`PRAGMA table_info(${tableName})`).map((row) => row.name),
    );
  } catch {
    return new Set<string>();
  }
}

function addColumnIfMissing(
  sqlite: SQLiteDatabase,
  tableName: string,
  columnName: string,
  columnSql: string,
) {
  const columns = getColumnNames(sqlite, tableName);
  if (columns.has(columnName)) {
    return;
  }
  sqlite.execSync(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
}

function addLocalWorkoutStartColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['user_id', "user_id TEXT NOT NULL DEFAULT ''"],
    ['template_id', 'template_id TEXT'],
    ['program_cycle_id', 'program_cycle_id TEXT'],
    ['cycle_workout_id', 'cycle_workout_id TEXT'],
    ['workout_type', `workout_type TEXT NOT NULL DEFAULT '${WORKOUT_TYPE_TRAINING}'`],
    ['name', "name TEXT NOT NULL DEFAULT 'Workout'"],
    ['started_at', 'started_at INTEGER NOT NULL DEFAULT 0'],
    ['completed_at', 'completed_at INTEGER'],
    ['notes', 'notes TEXT'],
    ['total_volume', 'total_volume REAL'],
    ['total_sets', 'total_sets INTEGER'],
    ['duration_minutes', 'duration_minutes INTEGER'],
    ['is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'created_at INTEGER NOT NULL DEFAULT 0'],
    ['updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0'],
    ['sync_status', "sync_status TEXT NOT NULL DEFAULT 'local'"],
    ['sync_operation_id', 'sync_operation_id TEXT'],
    ['sync_attempt_count', 'sync_attempt_count INTEGER NOT NULL DEFAULT 0'],
    ['last_sync_error', 'last_sync_error TEXT'],
    ['last_sync_attempt_at', 'last_sync_attempt_at INTEGER'],
    ['server_updated_at', 'server_updated_at INTEGER'],
    ['created_locally', 'created_locally INTEGER NOT NULL DEFAULT 1'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_workouts', columnName, columnSql);
  }
}

function addLocalWorkoutExerciseStartColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['workout_id', "workout_id TEXT NOT NULL DEFAULT ''"],
    ['exercise_id', "exercise_id TEXT NOT NULL DEFAULT ''"],
    ['library_id', 'library_id TEXT'],
    ['name', "name TEXT NOT NULL DEFAULT 'Exercise'"],
    ['muscle_group', 'muscle_group TEXT'],
    ['order_index', 'order_index INTEGER NOT NULL DEFAULT 0'],
    ['notes', 'notes TEXT'],
    ['is_amrap', 'is_amrap INTEGER NOT NULL DEFAULT 0'],
    ['is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'created_at INTEGER NOT NULL DEFAULT 0'],
    ['updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_workout_exercises', columnName, columnSql);
  }
}

function addLocalWorkoutSetStartColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['workout_exercise_id', "workout_exercise_id TEXT NOT NULL DEFAULT ''"],
    ['set_number', 'set_number INTEGER NOT NULL DEFAULT 1'],
    ['weight', 'weight REAL'],
    ['reps', 'reps INTEGER'],
    ['rpe', 'rpe REAL'],
    ['is_complete', 'is_complete INTEGER NOT NULL DEFAULT 0'],
    ['completed_at', 'completed_at INTEGER'],
    ['is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'created_at INTEGER NOT NULL DEFAULT 0'],
    ['updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_workout_sets', columnName, columnSql);
  }
}

function addLocalTemplateCacheColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['user_id', "user_id TEXT NOT NULL DEFAULT ''"],
    ['name', "name TEXT NOT NULL DEFAULT 'Template'"],
    ['description', 'description TEXT'],
    ['notes', 'notes TEXT'],
    ['default_weight_increment', 'default_weight_increment REAL'],
    ['default_bodyweight_increment', 'default_bodyweight_increment REAL'],
    ['default_cardio_increment', 'default_cardio_increment REAL'],
    ['default_timed_increment', 'default_timed_increment REAL'],
    ['default_plyo_increment', 'default_plyo_increment REAL'],
    ['is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0'],
    ['created_locally', 'created_locally INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'created_at INTEGER'],
    ['updated_at', 'updated_at INTEGER'],
    ['server_updated_at', 'server_updated_at INTEGER'],
    ['hydrated_at', 'hydrated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_templates', columnName, columnSql);
  }
}

function addLocalTemplateExerciseCacheColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['template_id', "template_id TEXT NOT NULL DEFAULT ''"],
    ['exercise_id', "exercise_id TEXT NOT NULL DEFAULT ''"],
    ['name', "name TEXT NOT NULL DEFAULT 'Exercise'"],
    ['muscle_group', 'muscle_group TEXT'],
    ['order_index', 'order_index INTEGER NOT NULL DEFAULT 0'],
    ['target_weight', 'target_weight REAL'],
    ['added_weight', 'added_weight REAL'],
    ['sets', 'sets INTEGER'],
    ['reps', 'reps INTEGER'],
    ['reps_raw', 'reps_raw TEXT'],
    ['is_amrap', 'is_amrap INTEGER NOT NULL DEFAULT 0'],
    ['is_accessory', 'is_accessory INTEGER NOT NULL DEFAULT 0'],
    ['is_required', 'is_required INTEGER NOT NULL DEFAULT 1'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_template_exercises', columnName, columnSql);
  }
}

function addLocalUserExerciseCacheColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['user_id', "user_id TEXT NOT NULL DEFAULT ''"],
    ['name', "name TEXT NOT NULL DEFAULT 'Exercise'"],
    ['muscle_group', 'muscle_group TEXT'],
    ['description', 'description TEXT'],
    ['library_id', 'library_id TEXT'],
    ['created_locally', 'created_locally INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'created_at INTEGER'],
    ['updated_at', 'updated_at INTEGER'],
    ['server_updated_at', 'server_updated_at INTEGER'],
    ['hydrated_at', 'hydrated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_user_exercises', columnName, columnSql);
  }
}

function addLocalProgramCycleCacheColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['user_id', "user_id TEXT NOT NULL DEFAULT ''"],
    ['program_slug', "program_slug TEXT NOT NULL DEFAULT ''"],
    ['name', "name TEXT NOT NULL DEFAULT 'Program'"],
    ['squat_1rm', 'squat_1rm REAL'],
    ['bench_1rm', 'bench_1rm REAL'],
    ['deadlift_1rm', 'deadlift_1rm REAL'],
    ['ohp_1rm', 'ohp_1rm REAL'],
    ['starting_squat_1rm', 'starting_squat_1rm REAL'],
    ['starting_bench_1rm', 'starting_bench_1rm REAL'],
    ['starting_deadlift_1rm', 'starting_deadlift_1rm REAL'],
    ['starting_ohp_1rm', 'starting_ohp_1rm REAL'],
    ['current_week', 'current_week INTEGER'],
    ['current_session', 'current_session INTEGER'],
    ['total_sessions_completed', 'total_sessions_completed INTEGER NOT NULL DEFAULT 0'],
    ['total_sessions_planned', 'total_sessions_planned INTEGER NOT NULL DEFAULT 0'],
    ['status', "status TEXT NOT NULL DEFAULT 'active'"],
    ['is_complete', 'is_complete INTEGER NOT NULL DEFAULT 0'],
    ['started_at', 'started_at INTEGER'],
    ['completed_at', 'completed_at INTEGER'],
    ['updated_at', 'updated_at INTEGER'],
    ['preferred_gym_days', 'preferred_gym_days TEXT'],
    ['preferred_time_of_day', 'preferred_time_of_day TEXT'],
    ['program_start_at', 'program_start_at INTEGER'],
    ['first_session_at', 'first_session_at INTEGER'],
    ['hydrated_at', 'hydrated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_program_cycles', columnName, columnSql);
  }
}

function addLocalProgramCycleWorkoutCacheColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['cycle_id', "cycle_id TEXT NOT NULL DEFAULT ''"],
    ['template_id', 'template_id TEXT'],
    ['week_number', 'week_number INTEGER NOT NULL DEFAULT 0'],
    ['session_number', 'session_number INTEGER NOT NULL DEFAULT 0'],
    ['session_name', "session_name TEXT NOT NULL DEFAULT 'Workout'"],
    ['target_lifts', 'target_lifts TEXT'],
    ['is_complete', 'is_complete INTEGER NOT NULL DEFAULT 0'],
    ['workout_id', 'workout_id TEXT'],
    ['created_at', 'created_at INTEGER'],
    ['updated_at', 'updated_at INTEGER'],
    ['scheduled_at', 'scheduled_at INTEGER'],
    ['server_updated_at', 'server_updated_at INTEGER'],
    ['hydrated_at', 'hydrated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_program_cycle_workouts', columnName, columnSql);
  }
}

function addLocalCustomProgramCacheColumns(sqlite: SQLiteDatabase) {
  for (const [columnName, columnSql] of [
    ['user_id', "user_id TEXT NOT NULL DEFAULT ''"],
    ['name', "name TEXT NOT NULL DEFAULT 'Custom Program'"],
    ['description', 'description TEXT'],
    ['notes', 'notes TEXT'],
    ['days_per_week', 'days_per_week INTEGER NOT NULL DEFAULT 1'],
    ['weeks', 'weeks INTEGER NOT NULL DEFAULT 1'],
    ['is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0'],
    ['created_locally', 'created_locally INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'created_at INTEGER'],
    ['updated_at', 'updated_at INTEGER'],
    ['server_updated_at', 'server_updated_at INTEGER'],
    ['hydrated_at', 'hydrated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_custom_programs', columnName, columnSql);
  }

  for (const [columnName, columnSql] of [
    ['custom_program_id', "custom_program_id TEXT NOT NULL DEFAULT ''"],
    ['day_index', 'day_index INTEGER NOT NULL DEFAULT 0'],
    ['name', "name TEXT NOT NULL DEFAULT 'Workout'"],
    ['order_index', 'order_index INTEGER NOT NULL DEFAULT 0'],
    ['is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'created_at INTEGER'],
    ['updated_at', 'updated_at INTEGER'],
    ['hydrated_at', 'hydrated_at INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_custom_program_workouts', columnName, columnSql);
  }

  for (const [columnName, columnSql] of [
    ['custom_program_workout_id', "custom_program_workout_id TEXT NOT NULL DEFAULT ''"],
    ['exercise_id', "exercise_id TEXT NOT NULL DEFAULT ''"],
    ['order_index', 'order_index INTEGER NOT NULL DEFAULT 0'],
    ['exercise_type', "exercise_type TEXT NOT NULL DEFAULT 'weights'"],
    ['sets', 'sets INTEGER'],
    ['reps', 'reps INTEGER'],
    ['reps_raw', 'reps_raw TEXT'],
    ['weight_mode', 'weight_mode TEXT'],
    ['fixed_weight', 'fixed_weight REAL'],
    ['percentage_of_lift', 'percentage_of_lift REAL'],
    ['percentage_lift', 'percentage_lift TEXT'],
    ['added_weight', 'added_weight REAL DEFAULT 0'],
    ['target_duration', 'target_duration INTEGER'],
    ['target_distance', 'target_distance INTEGER'],
    ['target_height', 'target_height INTEGER'],
    ['is_amrap', 'is_amrap INTEGER NOT NULL DEFAULT 0'],
    ['is_accessory', 'is_accessory INTEGER NOT NULL DEFAULT 0'],
    ['is_required', 'is_required INTEGER NOT NULL DEFAULT 1'],
    ['set_number', 'set_number INTEGER'],
    ['progression_amount', 'progression_amount REAL'],
    ['progression_interval', 'progression_interval INTEGER DEFAULT 1'],
    ['progression_type', "progression_type TEXT DEFAULT 'fixed'"],
  ] as const) {
    addColumnIfMissing(sqlite, 'local_custom_program_exercises', columnName, columnSql);
  }
}

function addLocalWorkoutSessionCacheColumns(sqlite: SQLiteDatabase) {
  addLocalWorkoutStartColumns(sqlite);
  addLocalWorkoutExerciseStartColumns(sqlite);
  addLocalWorkoutSetStartColumns(sqlite);
  addLocalTemplateCacheColumns(sqlite);
  addLocalTemplateExerciseCacheColumns(sqlite);
  addLocalUserExerciseCacheColumns(sqlite);
  addLocalProgramCycleCacheColumns(sqlite);
  addLocalProgramCycleWorkoutCacheColumns(sqlite);
  addLocalCustomProgramCacheColumns(sqlite);
}

function createLocalIndexes(sqlite: SQLiteDatabase) {
  sqlite.execSync(`
    CREATE INDEX IF NOT EXISTS idx_local_workouts_user_history
      ON local_workouts (user_id, is_deleted, started_at);
    CREATE INDEX IF NOT EXISTS idx_local_workout_exercises_workout
      ON local_workout_exercises (workout_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_local_workout_exercises_lower_name
      ON local_workout_exercises (lower(name));
    CREATE INDEX IF NOT EXISTS idx_local_templates_user
      ON local_templates (user_id, is_deleted, created_at);
    CREATE INDEX IF NOT EXISTS idx_local_user_exercises_user_name
      ON local_user_exercises (user_id, name);
    CREATE INDEX IF NOT EXISTS idx_local_program_cycles_user_status
      ON local_program_cycles (user_id, status, started_at);
    CREATE INDEX IF NOT EXISTS idx_local_program_cycle_workouts_cycle_order
      ON local_program_cycle_workouts (cycle_id, week_number, session_number);
    CREATE INDEX IF NOT EXISTS idx_local_custom_programs_user
      ON local_custom_programs (user_id, is_deleted, created_at);
    CREATE INDEX IF NOT EXISTS idx_local_custom_program_workouts_program_order
      ON local_custom_program_workouts (custom_program_id, day_index, order_index);
    CREATE INDEX IF NOT EXISTS idx_local_custom_program_exercises_workout_order
      ON local_custom_program_exercises (custom_program_workout_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_local_workout_sets_exercise_deleted_order
      ON local_workout_sets (workout_exercise_id, is_deleted, set_number);
    CREATE INDEX IF NOT EXISTS idx_local_sync_queue_user_runnable
      ON local_sync_queue (user_id, status, available_at, created_at);
  `);
}

function hasMigration(sqlite: SQLiteDatabase, id: string) {
  try {
    const rows = sqlite.getAllSync<{ id: string }>(
      'SELECT id FROM local_schema_migrations WHERE id = ? LIMIT 1',
      [id],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

function applyVersionedMigration(sqlite: SQLiteDatabase, id: string, migrate: () => void) {
  if (hasMigration(sqlite, id)) {
    return;
  }
  sqlite.withTransactionSync(() => {
    migrate();
    sqlite.runSync(
      'INSERT OR REPLACE INTO local_schema_migrations (id, applied_at) VALUES (?, ?)',
      [id, Date.now()],
    );
  });
}

export function runLocalMigrations(sqlite: SQLiteDatabase) {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS local_schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL,
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      distance_unit TEXT NOT NULL DEFAULT 'km',
      height_unit TEXT NOT NULL DEFAULT 'cm',
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
      workout_type TEXT NOT NULL DEFAULT 'training',
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
      library_id TEXT,
      name TEXT NOT NULL,
      muscle_group TEXT,
      exercise_type TEXT,
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
      duration INTEGER,
      distance INTEGER,
      height INTEGER,
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
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER,
      server_updated_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_template_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      template_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT,
      exercise_type TEXT NOT NULL DEFAULT 'weights',
      order_index INTEGER NOT NULL,
      target_weight REAL,
      added_weight REAL,
      sets INTEGER,
      reps INTEGER,
      reps_raw TEXT,
      target_duration INTEGER,
      target_distance INTEGER,
      target_height INTEGER,
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
      exercise_type TEXT,
      is_amrap INTEGER NOT NULL DEFAULT 0,
      created_locally INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER,
      server_updated_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_program_cycles (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      program_slug TEXT NOT NULL,
      name TEXT NOT NULL,
      squat_1rm REAL,
      bench_1rm REAL,
      deadlift_1rm REAL,
      ohp_1rm REAL,
      starting_squat_1rm REAL,
      starting_bench_1rm REAL,
      starting_deadlift_1rm REAL,
      starting_ohp_1rm REAL,
      current_week INTEGER,
      current_session INTEGER,
      total_sessions_completed INTEGER NOT NULL DEFAULT 0,
      total_sessions_planned INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_complete INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      updated_at INTEGER,
      preferred_gym_days TEXT,
      preferred_time_of_day TEXT,
      program_start_at INTEGER,
      first_session_at INTEGER,
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
      created_at INTEGER,
      updated_at INTEGER,
      scheduled_at INTEGER,
      server_updated_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_custom_programs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      notes TEXT,
      days_per_week INTEGER NOT NULL,
      weeks INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_locally INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER,
      server_updated_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_custom_program_workouts (
      id TEXT PRIMARY KEY NOT NULL,
      custom_program_id TEXT NOT NULL,
      day_index INTEGER NOT NULL,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER,
      hydrated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_custom_program_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      custom_program_workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      exercise_type TEXT NOT NULL DEFAULT 'weights',
      sets INTEGER,
      reps INTEGER,
      reps_raw TEXT,
      weight_mode TEXT,
      fixed_weight REAL,
      percentage_of_lift REAL,
      percentage_lift TEXT,
      added_weight REAL DEFAULT 0,
      target_duration INTEGER,
      target_distance INTEGER,
      target_height INTEGER,
      is_amrap INTEGER NOT NULL DEFAULT 0,
      is_accessory INTEGER NOT NULL DEFAULT 0,
      is_required INTEGER NOT NULL DEFAULT 1,
      set_number INTEGER,
      progression_amount REAL,
      progression_interval INTEGER DEFAULT 1,
      progression_type TEXT DEFAULT 'fixed'
    );

    CREATE TABLE IF NOT EXISTS local_training_cache_meta (
      user_id TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      hydrated_at INTEGER NOT NULL,
      generated_at INTEGER,
      PRIMARY KEY (user_id, cache_key)
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

    CREATE TABLE IF NOT EXISTS local_pending_workouts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'program',
      program_cycle_id TEXT NOT NULL,
      cycle_workout_id TEXT NOT NULL,
      exercises_json TEXT NOT NULL,
      exercise_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  applyVersionedMigration(sqlite, '20260428_training_cache_columns', () => {
    addLocalWorkoutSessionCacheColumns(sqlite);

    for (const [columnName, columnSql] of [
      ['squat_1rm', 'squat_1rm REAL'],
      ['bench_1rm', 'bench_1rm REAL'],
      ['deadlift_1rm', 'deadlift_1rm REAL'],
      ['ohp_1rm', 'ohp_1rm REAL'],
      ['starting_squat_1rm', 'starting_squat_1rm REAL'],
      ['starting_bench_1rm', 'starting_bench_1rm REAL'],
      ['starting_deadlift_1rm', 'starting_deadlift_1rm REAL'],
      ['starting_ohp_1rm', 'starting_ohp_1rm REAL'],
      ['is_complete', 'is_complete INTEGER NOT NULL DEFAULT 0'],
      ['started_at', 'started_at INTEGER'],
      ['completed_at', 'completed_at INTEGER'],
      ['updated_at', 'updated_at INTEGER'],
      ['preferred_gym_days', 'preferred_gym_days TEXT'],
      ['preferred_time_of_day', 'preferred_time_of_day TEXT'],
      ['program_start_at', 'program_start_at INTEGER'],
      ['first_session_at', 'first_session_at INTEGER'],
    ] as const) {
      addColumnIfMissing(sqlite, 'local_program_cycles', columnName, columnSql);
    }

    for (const [columnName, columnSql] of [
      ['created_at', 'created_at INTEGER'],
      ['updated_at', 'updated_at INTEGER'],
      ['scheduled_at', 'scheduled_at INTEGER'],
      ['server_updated_at', 'server_updated_at INTEGER'],
    ] as const) {
      addColumnIfMissing(sqlite, 'local_program_cycle_workouts', columnName, columnSql);
    }

    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS local_training_cache_meta (
        user_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        hydrated_at INTEGER NOT NULL,
        generated_at INTEGER,
        PRIMARY KEY (user_id, cache_key)
      );
      CREATE INDEX IF NOT EXISTS idx_local_workouts_user_active
        ON local_workouts (user_id, completed_at, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_local_templates_user
        ON local_templates (user_id, is_deleted, updated_at);
      CREATE INDEX IF NOT EXISTS idx_local_user_exercises_user_name
        ON local_user_exercises (user_id, name);
      CREATE INDEX IF NOT EXISTS idx_local_program_cycles_user_status
        ON local_program_cycles (user_id, status);
      CREATE INDEX IF NOT EXISTS idx_local_program_cycle_workouts_cycle_order
        ON local_program_cycle_workouts (cycle_id, week_number, session_number);
    `);
  });

  applyVersionedMigration(sqlite, '20260505_local_workouts_start_columns', () => {
    addLocalWorkoutSessionCacheColumns(sqlite);
  });

  applyVersionedMigration(sqlite, '20260505_local_workout_type', () => {
    addColumnIfMissing(
      sqlite,
      'local_workouts',
      'workout_type',
      `workout_type TEXT NOT NULL DEFAULT '${WORKOUT_TYPE_TRAINING}'`,
    );
    sqlite.execSync(`
      UPDATE local_workouts
      SET workout_type = '${WORKOUT_TYPE_ONE_RM_TEST}'
      WHERE name = '1RM Test';
      CREATE INDEX IF NOT EXISTS idx_local_workouts_user_type_history
        ON local_workouts (user_id, workout_type, is_deleted, started_at);
    `);
  });

  applyVersionedMigration(sqlite, '20260505_local_workout_session_cache_columns', () => {
    addLocalWorkoutSessionCacheColumns(sqlite);
  });

  applyVersionedMigration(sqlite, '20260513_local_custom_program_tables', () => {
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS local_custom_programs (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        notes TEXT,
        days_per_week INTEGER NOT NULL,
        weeks INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_locally INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        server_updated_at INTEGER,
        hydrated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_custom_program_workouts (
        id TEXT PRIMARY KEY NOT NULL,
        custom_program_id TEXT NOT NULL,
        day_index INTEGER NOT NULL,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        hydrated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_custom_program_exercises (
        id TEXT PRIMARY KEY NOT NULL,
        custom_program_workout_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        exercise_type TEXT NOT NULL DEFAULT 'weights',
        sets INTEGER,
        reps INTEGER,
        reps_raw TEXT,
        weight_mode TEXT,
        fixed_weight REAL,
        percentage_of_lift REAL,
        percentage_lift TEXT,
        added_weight REAL DEFAULT 0,
        target_duration INTEGER,
        target_distance INTEGER,
        target_height INTEGER,
        is_amrap INTEGER NOT NULL DEFAULT 0,
        is_accessory INTEGER NOT NULL DEFAULT 0,
        is_required INTEGER NOT NULL DEFAULT 1,
        set_number INTEGER,
        progression_amount REAL,
        progression_interval INTEGER DEFAULT 1,
        progression_type TEXT DEFAULT 'fixed'
      );
    `);
    addLocalCustomProgramCacheColumns(sqlite);
    createLocalIndexes(sqlite);
  });

  applyVersionedMigration(sqlite, '20260506_clear_empty_active_workout_drafts', () => {
    sqlite.execSync(`
      UPDATE local_program_cycle_workouts
      SET workout_id = NULL
      WHERE workout_id IN (
        SELECT w.id
        FROM local_workouts w
        WHERE w.completed_at IS NULL
          AND w.is_deleted = 0
          AND (w.workout_type = '${WORKOUT_TYPE_ONE_RM_TEST}' OR w.cycle_workout_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1
            FROM local_workout_exercises e
            WHERE e.workout_id = w.id
              AND e.is_deleted = 0
          )
      );

      UPDATE local_workouts
      SET is_deleted = 1,
          sync_status = 'local',
          updated_at = strftime('%s', 'now') * 1000
      WHERE completed_at IS NULL
        AND is_deleted = 0
        AND (workout_type = '${WORKOUT_TYPE_ONE_RM_TEST}' OR cycle_workout_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM local_workout_exercises e
          WHERE e.workout_id = local_workouts.id
            AND e.is_deleted = 0
        );
    `);
  });

  applyVersionedMigration(sqlite, '20260502_performance_indexes', () => {
    createLocalIndexes(sqlite);
  });

  applyVersionedMigration(sqlite, '20260505_local_index_cleanup', () => {
    sqlite.execSync(`
      DROP INDEX IF EXISTS idx_local_workouts_user_active;
      DROP INDEX IF EXISTS idx_local_workout_sets_exercise;
      DROP INDEX IF EXISTS idx_local_sync_queue_runnable;
      DROP INDEX IF EXISTS idx_local_workouts_user_history;
      DROP INDEX IF EXISTS idx_local_templates_user;
      DROP INDEX IF EXISTS idx_local_program_cycles_user_status;
      DROP INDEX IF EXISTS idx_local_sync_queue_user_runnable;
      DROP INDEX IF EXISTS idx_local_workouts_user_type_history;
    `);
    createLocalIndexes(sqlite);
    sqlite.execSync(`
      CREATE INDEX IF NOT EXISTS idx_local_workouts_user_type_history
        ON local_workouts (user_id, workout_type, is_deleted, started_at);
    `);
  });

  applyVersionedMigration(sqlite, '20260503_local_templates_created_locally', () => {
    addColumnIfMissing(
      sqlite,
      'local_templates',
      'created_locally',
      'created_locally INTEGER NOT NULL DEFAULT 0',
    );
  });

  applyVersionedMigration(sqlite, '20260502_local_cache_expansion', () => {
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS local_last_workouts (
        user_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        weight REAL,
        reps INTEGER,
        rpe REAL,
        date TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, exercise_id)
      );

      CREATE TABLE IF NOT EXISTS local_nutrition_daily_summaries (
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        json TEXT NOT NULL,
        hydrated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, date, timezone)
      );

      CREATE TABLE IF NOT EXISTS local_body_stats (
        user_id TEXT PRIMARY KEY NOT NULL,
        bodyweight_kg REAL,
        height_cm REAL,
        target_calories INTEGER,
        target_protein_g INTEGER,
        target_carbs_g INTEGER,
        target_fat_g INTEGER,
        recorded_at INTEGER,
        server_updated_at INTEGER,
        hydrated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_whoop_data (
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        recovery_score REAL,
        status TEXT,
        hrv REAL,
        calories_burned REAL,
        total_strain REAL,
        server_updated_at INTEGER,
        hydrated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, date, timezone)
      );
    `);
  });

  applyVersionedMigration(sqlite, '20260505_clear_last_workout_cache_after_workout_type', () => {
    sqlite.execSync('DELETE FROM local_last_workouts');
  });

  applyVersionedMigration(sqlite, '20260503_chat_message_queue', () => {
    sqlite.execSync(`CREATE TABLE IF NOT EXISTS local_chat_message_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      timezone TEXT NOT NULL,
      content TEXT NOT NULL,
      has_image INTEGER NOT NULL DEFAULT 0,
      image_base64 TEXT,
      messages_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      job_id TEXT,
      assistant_content TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  });

  applyVersionedMigration(sqlite, '20260505_local_pending_workouts', () => {
    sqlite.execSync(`CREATE TABLE IF NOT EXISTS local_pending_workouts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'program',
      program_cycle_id TEXT NOT NULL,
      cycle_workout_id TEXT NOT NULL,
      exercises_json TEXT NOT NULL,
      exercise_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`);
  });

  applyVersionedMigration(sqlite, '20260506_exercise_types', () => {
    addColumnIfMissing(
      sqlite,
      'local_user_preferences',
      'distance_unit',
      "distance_unit TEXT NOT NULL DEFAULT 'km'",
    );
    addColumnIfMissing(sqlite, 'local_user_exercises', 'exercise_type', 'exercise_type TEXT');
    addColumnIfMissing(
      sqlite,
      'local_user_exercises',
      'is_amrap',
      'is_amrap INTEGER NOT NULL DEFAULT 0',
    );
    addColumnIfMissing(sqlite, 'local_workout_exercises', 'exercise_type', 'exercise_type TEXT');
    addColumnIfMissing(sqlite, 'local_workout_sets', 'duration', 'duration INTEGER');
    addColumnIfMissing(sqlite, 'local_workout_sets', 'distance', 'distance INTEGER');
    addColumnIfMissing(sqlite, 'local_workout_sets', 'height', 'height INTEGER');
    addColumnIfMissing(
      sqlite,
      'local_template_exercises',
      'exercise_type',
      "exercise_type TEXT NOT NULL DEFAULT 'weights'",
    );
    addColumnIfMissing(
      sqlite,
      'local_template_exercises',
      'target_duration',
      'target_duration INTEGER',
    );
    addColumnIfMissing(
      sqlite,
      'local_template_exercises',
      'target_distance',
      'target_distance INTEGER',
    );
    addColumnIfMissing(
      sqlite,
      'local_template_exercises',
      'target_height',
      'target_height INTEGER',
    );
  });

  applyVersionedMigration(sqlite, '20260506_height_unit_preference', () => {
    addColumnIfMissing(
      sqlite,
      'local_user_preferences',
      'height_unit',
      "height_unit TEXT NOT NULL DEFAULT 'cm'",
    );
  });

  applyVersionedMigration(sqlite, '20260506_last_workout_types', () => {
    addColumnIfMissing(sqlite, 'local_last_workouts', 'duration', 'duration INTEGER');
    addColumnIfMissing(sqlite, 'local_last_workouts', 'distance', 'distance INTEGER');
    addColumnIfMissing(sqlite, 'local_last_workouts', 'height', 'height INTEGER');
  });

  applyVersionedMigration(sqlite, '20260506_bodyweight_history', () => {
    sqlite.execSync(`CREATE TABLE IF NOT EXISTS local_bodyweight_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bodyweight_kg REAL NOT NULL,
      recorded_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      hydrated_at INTEGER NOT NULL
    )`);
  });

  applyVersionedMigration(sqlite, '20260507_template_progression_columns', () => {
    addColumnIfMissing(
      sqlite,
      'local_templates',
      'default_weight_increment',
      'default_weight_increment REAL',
    );
    addColumnIfMissing(
      sqlite,
      'local_templates',
      'default_bodyweight_increment',
      'default_bodyweight_increment REAL',
    );
    addColumnIfMissing(
      sqlite,
      'local_templates',
      'default_cardio_increment',
      'default_cardio_increment REAL',
    );
    addColumnIfMissing(
      sqlite,
      'local_templates',
      'default_timed_increment',
      'default_timed_increment REAL',
    );
    addColumnIfMissing(
      sqlite,
      'local_templates',
      'default_plyo_increment',
      'default_plyo_increment REAL',
    );
  });

  applyVersionedMigration(sqlite, '20260507_nutrition_local_tables', () => {
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS local_nutrition_chat_messages (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        has_image INTEGER NOT NULL DEFAULT 0,
        image_uri TEXT,
        created_at INTEGER NOT NULL,
        synced_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_nutrition_entries (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        meal_type TEXT,
        name TEXT,
        calories REAL,
        protein_g REAL,
        carbs_g REAL,
        fat_g REAL,
        logged_at INTEGER NOT NULL,
        synced_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_nutrition_training_context (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL UNIQUE,
        training_type TEXT NOT NULL,
        custom_label TEXT,
        synced_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_nutrition_chat_messages_user_date
        ON local_nutrition_chat_messages (user_id, date, created_at);
      CREATE INDEX IF NOT EXISTS idx_local_nutrition_entries_user_date
        ON local_nutrition_entries (user_id, date, logged_at);
    `);
  });

  applyVersionedMigration(sqlite, '20260508_whoop_recovery_snapshot', () => {
    addColumnIfMissing(
      sqlite,
      'local_whoop_data',
      'is_whoop_connected',
      'is_whoop_connected INTEGER',
    );
    addColumnIfMissing(
      sqlite,
      'local_whoop_data',
      'sleep_duration_label',
      'sleep_duration_label TEXT',
    );
    addColumnIfMissing(
      sqlite,
      'local_whoop_data',
      'sleep_performance_percentage',
      'sleep_performance_percentage REAL',
    );
    sqlite.execSync(`
      CREATE INDEX IF NOT EXISTS idx_local_whoop_data_user_date
        ON local_whoop_data (user_id, date);
    `);
  });

  createLocalIndexes(sqlite);
}
