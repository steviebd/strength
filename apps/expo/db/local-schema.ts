import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const localSchemaMigrations = sqliteTable('local_schema_migrations', {
  id: text('id').primaryKey(),
  appliedAt: integer('applied_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localUserPreferences = sqliteTable('local_user_preferences', {
  userId: text('user_id').primaryKey(),
  weightUnit: text('weight_unit').notNull().default('kg'),
  timezone: text('timezone'),
  bodyweightKg: real('bodyweight_kg'),
  weightPromptedAt: integer('weight_prompted_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
  localUpdatedAt: integer('local_updated_at', { mode: 'timestamp_ms' }).notNull(),
  hydratedFromServerAt: integer('hydrated_from_server_at', { mode: 'timestamp_ms' }),
});

export const localTimezoneDismissals = sqliteTable(
  'local_timezone_dismissals',
  {
    userId: text('user_id').notNull(),
    deviceTimezone: text('device_timezone').notNull(),
    dismissedAt: integer('dismissed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deviceTimezone] })],
);

export const localWorkouts = sqliteTable('local_workouts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  templateId: text('template_id'),
  programCycleId: text('program_cycle_id'),
  cycleWorkoutId: text('cycle_workout_id'),
  name: text('name').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  notes: text('notes'),
  totalVolume: real('total_volume'),
  totalSets: integer('total_sets'),
  durationMinutes: integer('duration_minutes'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncStatus: text('sync_status').notNull().default('local'),
  syncOperationId: text('sync_operation_id'),
  syncAttemptCount: integer('sync_attempt_count').notNull().default(0),
  lastSyncError: text('last_sync_error'),
  lastSyncAttemptAt: integer('last_sync_attempt_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
  createdLocally: integer('created_locally', { mode: 'boolean' }).notNull().default(true),
});

export const localWorkoutExercises = sqliteTable('local_workout_exercises', {
  id: text('id').primaryKey(),
  workoutId: text('workout_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  libraryId: text('library_id'),
  name: text('name').notNull(),
  muscleGroup: text('muscle_group'),
  orderIndex: integer('order_index').notNull(),
  notes: text('notes'),
  isAmrap: integer('is_amrap', { mode: 'boolean' }).notNull().default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localWorkoutSets = sqliteTable('local_workout_sets', {
  id: text('id').primaryKey(),
  workoutExerciseId: text('workout_exercise_id').notNull(),
  setNumber: integer('set_number').notNull(),
  weight: real('weight'),
  reps: integer('reps'),
  rpe: real('rpe'),
  isComplete: integer('is_complete', { mode: 'boolean' }).notNull().default(false),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localTemplates = sqliteTable('local_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  notes: text('notes'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  createdLocally: integer('created_locally', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
  hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localTemplateExercises = sqliteTable('local_template_exercises', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  name: text('name').notNull(),
  muscleGroup: text('muscle_group'),
  orderIndex: integer('order_index').notNull(),
  targetWeight: real('target_weight'),
  addedWeight: real('added_weight'),
  sets: integer('sets'),
  reps: integer('reps'),
  repsRaw: text('reps_raw'),
  isAmrap: integer('is_amrap', { mode: 'boolean' }).notNull().default(false),
  isAccessory: integer('is_accessory', { mode: 'boolean' }).notNull().default(false),
  isRequired: integer('is_required', { mode: 'boolean' }).notNull().default(true),
});

export const localUserExercises = sqliteTable('local_user_exercises', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  muscleGroup: text('muscle_group'),
  description: text('description'),
  libraryId: text('library_id'),
  createdLocally: integer('created_locally', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
  hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localProgramCycles = sqliteTable('local_program_cycles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  programSlug: text('program_slug').notNull(),
  name: text('name').notNull(),
  squat1rm: real('squat_1rm'),
  bench1rm: real('bench_1rm'),
  deadlift1rm: real('deadlift_1rm'),
  ohp1rm: real('ohp_1rm'),
  startingSquat1rm: real('starting_squat_1rm'),
  startingBench1rm: real('starting_bench_1rm'),
  startingDeadlift1rm: real('starting_deadlift_1rm'),
  startingOhp1rm: real('starting_ohp_1rm'),
  currentWeek: integer('current_week'),
  currentSession: integer('current_session'),
  totalSessionsCompleted: integer('total_sessions_completed').notNull().default(0),
  totalSessionsPlanned: integer('total_sessions_planned').notNull(),
  status: text('status').notNull().default('active'),
  isComplete: integer('is_complete', { mode: 'boolean' }).notNull().default(false),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  preferredGymDays: text('preferred_gym_days'),
  preferredTimeOfDay: text('preferred_time_of_day'),
  programStartAt: integer('program_start_at', { mode: 'timestamp_ms' }),
  firstSessionAt: integer('first_session_at', { mode: 'timestamp_ms' }),
  hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localProgramCycleWorkouts = sqliteTable('local_program_cycle_workouts', {
  id: text('id').primaryKey(),
  cycleId: text('cycle_id').notNull(),
  templateId: text('template_id'),
  weekNumber: integer('week_number').notNull(),
  sessionNumber: integer('session_number').notNull(),
  sessionName: text('session_name').notNull(),
  targetLifts: text('target_lifts'),
  isComplete: integer('is_complete', { mode: 'boolean' }).notNull().default(false),
  workoutId: text('workout_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
  hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localTrainingCacheMeta = sqliteTable(
  'local_training_cache_meta',
  {
    userId: text('user_id').notNull(),
    cacheKey: text('cache_key').notNull(),
    hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
    generatedAt: integer('generated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cacheKey] })],
);

export const localSyncQueue = sqliteTable('local_sync_queue', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation').notNull(),
  payloadJson: text('payload_json').notNull(),
  status: text('status').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),
  availableAt: integer('available_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localLastWorkouts = sqliteTable(
  'local_last_workouts',
  {
    userId: text('user_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    rpe: real('rpe'),
    date: text('date').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.exerciseId] })],
);

export const localNutritionDailySummaries = sqliteTable(
  'local_nutrition_daily_summaries',
  {
    userId: text('user_id').notNull(),
    date: text('date').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    json: text('json').notNull(),
    hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date, table.timezone] })],
);

export const localBodyStats = sqliteTable('local_body_stats', {
  userId: text('user_id').primaryKey(),
  bodyweightKg: real('bodyweight_kg'),
  heightCm: real('height_cm'),
  targetCalories: integer('target_calories'),
  targetProteinG: integer('target_protein_g'),
  targetCarbsG: integer('target_carbs_g'),
  targetFatG: integer('target_fat_g'),
  recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
  hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localWhoopData = sqliteTable(
  'local_whoop_data',
  {
    userId: text('user_id').notNull(),
    date: text('date').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    recoveryScore: real('recovery_score'),
    status: text('status'),
    hrv: real('hrv'),
    caloriesBurned: real('calories_burned'),
    totalStrain: real('total_strain'),
    serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
    hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date, table.timezone] })],
);

export type LocalUserPreferences = typeof localUserPreferences.$inferSelect;
export type LocalWorkout = typeof localWorkouts.$inferSelect;
export type LocalWorkoutExercise = typeof localWorkoutExercises.$inferSelect;
export type LocalWorkoutSet = typeof localWorkoutSets.$inferSelect;
export type LocalSyncQueueItem = typeof localSyncQueue.$inferSelect;
export type LocalLastWorkout = typeof localLastWorkouts.$inferSelect;
export type LocalNutritionDailySummary = typeof localNutritionDailySummaries.$inferSelect;
export type LocalBodyStat = typeof localBodyStats.$inferSelect;
export type LocalWhoopDatum = typeof localWhoopData.$inferSelect;
