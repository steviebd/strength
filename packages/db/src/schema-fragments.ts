import { integer, real, text } from 'drizzle-orm/sqlite-core';

export function userIdColumn() {
  return text('user_id').notNull();
}

export function timestampsColumns() {
  return {
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  };
}

export function softDeleteColumn() {
  return integer('is_deleted', { mode: 'boolean' }).default(false);
}

export function workoutCoreColumns() {
  return {
    workoutType: text('workout_type').notNull().default('training'),
    name: text('name').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    ...softDeleteColumn(),
    ...timestampsColumns(),
    totalVolume: real('total_volume'),
    totalSets: integer('total_sets'),
    durationMinutes: integer('duration_minutes'),
  };
}

export function workoutSetColumns() {
  return {
    setNumber: integer('set_number').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    duration: integer('duration'),
    distance: integer('distance'),
    height: integer('height'),
    rpe: real('rpe'),
    isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    ...softDeleteColumn(),
    ...timestampsColumns(),
  };
}

export function templateCoreColumns() {
  return {
    name: text('name').notNull(),
    description: text('description'),
    notes: text('notes'),
    defaultWeightIncrement: real('default_weight_increment').default(2.5),
    defaultBodyweightIncrement: real('default_bodyweight_increment').default(2),
    defaultCardioIncrement: real('default_cardio_increment').default(60),
    defaultTimedIncrement: real('default_timed_increment').default(5),
    defaultPlyoIncrement: real('default_plyo_increment').default(1),
    ...softDeleteColumn(),
    ...timestampsColumns(),
  };
}

export function templateExerciseColumns() {
  return {
    orderIndex: integer('order_index').notNull(),
    targetWeight: real('target_weight'),
    addedWeight: real('added_weight').default(0),
    sets: integer('sets'),
    reps: integer('reps'),
    repsRaw: text('reps_raw'),
    exerciseType: text('exercise_type').notNull().default('weights'),
    targetDuration: integer('target_duration'),
    targetDistance: integer('target_distance'),
    targetHeight: integer('target_height'),
    isAmrap: integer('is_amrap', { mode: 'boolean' }).default(false),
    isAccessory: integer('is_accessory', { mode: 'boolean' }).default(false),
    isRequired: integer('is_required', { mode: 'boolean' }).default(true),
  };
}

export function exerciseCoreColumns() {
  return {
    name: text('name').notNull(),
    muscleGroup: text('muscle_group'),
    description: text('description'),
    libraryId: text('library_id'),
    exerciseType: text('exercise_type'),
    isAmrap: integer('is_amrap', { mode: 'boolean' }).default(false),
    ...timestampsColumns(),
  };
}

export function programCycleCoreColumns() {
  return {
    programSlug: text('program_slug').notNull(),
    name: text('name').notNull(),
    currentWeek: integer('current_week').default(1),
    currentSession: integer('current_session').default(1),
    totalSessionsCompleted: integer('total_sessions_completed').notNull().default(0),
    totalSessionsPlanned: integer('total_sessions_planned').notNull(),
    status: text('status').notNull().default('active'),
    isComplete: integer('is_complete', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    preferredGymDays: text('preferred_gym_days'),
    preferredTimeOfDay: text('preferred_time_of_day'),
    programStartAt: integer('program_start_at', { mode: 'timestamp_ms' }),
    firstSessionAt: integer('first_session_at', { mode: 'timestamp_ms' }),
  };
}

export function programCycleWorkoutColumns() {
  return {
    weekNumber: integer('week_number').notNull(),
    sessionNumber: integer('session_number').notNull(),
    sessionName: text('session_name').notNull(),
    targetLifts: text('target_lifts'),
    isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
    workoutId: text('workout_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }),
  };
}

export function syncWorkoutColumns() {
  return {
    syncStatus: text('sync_status').notNull().default('local'),
    syncOperationId: text('sync_operation_id'),
    syncAttemptCount: integer('sync_attempt_count').notNull().default(0),
    lastSyncError: text('last_sync_error'),
    lastSyncAttemptAt: integer('last_sync_attempt_at', { mode: 'timestamp_ms' }),
    serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
    createdLocally: integer('created_locally', { mode: 'boolean' }).notNull().default(true),
  };
}

export function syncCacheColumns() {
  return {
    serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
    createdLocally: integer('created_locally', { mode: 'boolean' }).notNull().default(false),
    hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
  };
}

export function syncProgramCycleColumns() {
  return {
    hydratedAt: integer('hydrated_at', { mode: 'timestamp_ms' }).notNull(),
  };
}
