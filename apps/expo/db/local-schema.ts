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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const localProgramCycles = sqliteTable('local_program_cycles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  programSlug: text('program_slug').notNull(),
  name: text('name').notNull(),
  currentWeek: integer('current_week'),
  currentSession: integer('current_session'),
  totalSessionsCompleted: integer('total_sessions_completed').notNull().default(0),
  totalSessionsPlanned: integer('total_sessions_planned').notNull(),
  status: text('status').notNull().default('active'),
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
  scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }),
  hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
});

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

export type LocalUserPreferences = typeof localUserPreferences.$inferSelect;
export type LocalWorkout = typeof localWorkouts.$inferSelect;
export type LocalWorkoutExercise = typeof localWorkoutExercises.$inferSelect;
export type LocalWorkoutSet = typeof localWorkoutSets.$inferSelect;
export type LocalSyncQueueItem = typeof localSyncQueue.$inferSelect;
