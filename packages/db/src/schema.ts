import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(array);
  } else {
    for (let index = 0; index < array.length; index++) {
      array[index] = Math.floor(Math.random() * 256);
    }
  }
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;
  const hex = Array.from(array, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export const WORKOUT_TYPE_TRAINING = 'training';
export const WORKOUT_TYPE_ONE_RM_TEST = 'one_rm_test';

export type WorkoutType = typeof WORKOUT_TYPE_TRAINING | typeof WORKOUT_TYPE_ONE_RM_TEST;

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  weightUnit: text('weight_unit').default('kg'),
  distanceUnit: text('distance_unit').default('km'),
  timezone: text('timezone'),
  weightPromptedAt: integer('weight_prompted_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const homeSummary = sqliteTable('home_summary', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  streakCount: integer('streak_count').default(0),
  lastWorkoutDate: integer('last_workout_date', { mode: 'timestamp_ms' }),
  weeklyVolume: real('weekly_volume').default(0),
  weeklyWorkouts: integer('weekly_workouts').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('idx_session_user_id').on(t.userId)],
);

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    muscleGroup: text('muscle_group'),
    description: text('description'),
    libraryId: text('library_id'),
    exerciseType: text('exercise_type'),
    isAmrap: integer('is_amrap', { mode: 'boolean' }).default(false),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('exercises_user_id_library_id_unique').on(t.userId, t.libraryId),
    uniqueIndex('exercises_user_id_name_unique').on(t.userId, sql`lower(${t.name})`),
    index('idx_exercises_user_deleted_created_at').on(t.userId, t.isDeleted, t.createdAt),
    index('idx_exercises_user_deleted_lower_name').on(t.userId, t.isDeleted, sql`lower(${t.name})`),
  ],
);

export const templates = sqliteTable(
  'templates',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    notes: text('notes'),
    programCycleId: text('program_cycle_id'),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_templates_user_deleted_created_at').on(t.userId, t.isDeleted, t.createdAt)],
);

export const templateExercises = sqliteTable('template_exercises', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  templateId: text('template_id')
    .notNull()
    .references(() => templates.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  targetWeight: real('target_weight'),
  addedWeight: real('added_weight').default(0),
  sets: integer('sets'),
  reps: integer('reps'),
  repsRaw: text('reps_raw'),
  exerciseType: text('exercise_type').notNull(),
  targetDuration: integer('target_duration'),
  targetDistance: integer('target_distance'),
  targetHeight: integer('target_height'),
  isAmrap: integer('is_amrap', { mode: 'boolean' }).default(false),
  isAccessory: integer('is_accessory', { mode: 'boolean' }).default(false),
  isRequired: integer('is_required', { mode: 'boolean' }).default(true),
  setNumber: integer('set_number'),
});

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    templateId: text('template_id').references(() => templates.id, { onDelete: 'set null' }),
    programCycleId: text('program_cycle_id').references(() => userProgramCycles.id, {
      onDelete: 'set null',
    }),
    workoutType: text('workout_type').notNull().default(WORKOUT_TYPE_TRAINING),
    name: text('name').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    squat1rm: real('squat_1rm'),
    bench1rm: real('bench_1rm'),
    deadlift1rm: real('deadlift_1rm'),
    ohp1rm: real('ohp_1rm'),
    startingSquat1rm: real('starting_squat_1rm'),
    startingBench1rm: real('starting_bench_1rm'),
    startingDeadlift1rm: real('starting_deadlift_1rm'),
    startingOhp1rm: real('starting_ohp_1rm'),
    totalVolume: real('total_volume'),
    totalSets: integer('total_sets'),
    durationMinutes: integer('duration_minutes'),
  },
  (t) => [
    index('idx_workouts_user_deleted_started_at').on(t.userId, t.isDeleted, t.startedAt),
    index('idx_workouts_user_deleted_completed_at').on(t.userId, t.isDeleted, t.completedAt),
  ],
);

export const workoutExercises = sqliteTable('workout_exercises', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  workoutId: text('workout_id')
    .notNull()
    .references(() => workouts.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  notes: text('notes'),
  isAmrap: integer('is_amrap', { mode: 'boolean' }).default(false),
  setNumber: integer('set_number'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    workoutExerciseId: text('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    duration: integer('duration'),
    distance: integer('distance'),
    height: integer('height'),
    rpe: real('rpe'),
    isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_workout_sets_exercise_set_number').on(t.workoutExerciseId, t.setNumber)],
);

export const workoutSyncOperations = sqliteTable(
  'workout_sync_operations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workoutId: text('workout_id').notNull(),
    status: text('status').notNull().default('applied'),
    requestHash: text('request_hash'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique('workout_sync_operations_user_id_id_unique').on(t.userId, t.id)],
);

export const userProgramCycles = sqliteTable(
  'user_program_cycles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    programSlug: text('program_slug').notNull(),
    name: text('name').notNull(),
    squat1rm: real('squat_1rm').notNull(),
    bench1rm: real('bench_1rm').notNull(),
    deadlift1rm: real('deadlift_1rm').notNull(),
    ohp1rm: real('ohp_1rm').notNull(),
    startingSquat1rm: real('starting_squat_1rm'),
    startingBench1rm: real('starting_bench_1rm'),
    startingDeadlift1rm: real('starting_deadlift_1rm'),
    startingOhp1rm: real('starting_ohp_1rm'),
    currentWeek: integer('current_week').default(1),
    currentSession: integer('current_session').default(1),
    totalSessionsCompleted: integer('total_sessions_completed').default(0),
    totalSessionsPlanned: integer('total_sessions_planned').notNull(),
    estimatedWeeks: integer('estimated_weeks'),
    status: text('status').default('active'),
    isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    preferredGymDays: text('preferred_gym_days'),
    preferredTimeOfDay: text('preferred_time_of_day'),
    programStartAt: integer('program_start_at', { mode: 'timestamp_ms' }),
    firstSessionAt: integer('first_session_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('idx_user_program_cycles_user_status_started_at').on(t.userId, t.status, t.startedAt),
  ],
);

export const programCycleWorkouts = sqliteTable(
  'program_cycle_workouts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => userProgramCycles.id, { onDelete: 'cascade' }),
    templateId: text('template_id').references(() => templates.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    sessionNumber: integer('session_number').notNull(),
    sessionName: text('session_name').notNull(),
    targetLifts: text('target_lifts'),
    isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
    workoutId: text('workout_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('idx_program_cycle_workouts_cycle_order').on(t.cycleId, t.weekNumber, t.sessionNumber),
  ],
);

export const _exercisesMuscleGroupIdx = index('idx_exercises_muscle_group').on(
  exercises.muscleGroup,
);

export const _workoutsTemplateIdIdx = index('idx_workouts_template_id').on(workouts.templateId);

export const _workoutExercisesOrderIdx = index('idx_workout_exercises_order').on(
  workoutExercises.workoutId,
  workoutExercises.orderIndex,
);
export const _workoutExercisesExerciseIdIdx = index('idx_workout_exercises_exercise_id').on(
  workoutExercises.exerciseId,
);

export const _programCycleWorkoutsScheduledAtIdx = index(
  'idx_program_cycle_workouts_scheduled_at',
).on(programCycleWorkouts.scheduledAt);

export const _templateExercisesTemplateIdIdx = index('idx_template_exercises_template_id').on(
  templateExercises.templateId,
  templateExercises.orderIndex,
);

export const userIntegration = sqliteTable(
  'user_integration',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id'),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('user_integration_user_id_provider_unique').on(t.userId, t.provider),
    unique('user_integration_provider_provider_user_id_unique').on(t.provider, t.providerUserId),
  ],
);

export const whoopProfile = sqliteTable('whoop_profile', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  whoopUserId: text('whoop_user_id').notNull().unique(),
  email: text('email'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  rawData: text('raw_data'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const whoopWorkout = sqliteTable('whoop_workout', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  whoopWorkoutId: text('whoop_workout_id').notNull().unique(),
  start: integer('start', { mode: 'timestamp_ms' }).notNull(),
  end: integer('end', { mode: 'timestamp_ms' }).notNull(),
  timezoneOffset: text('timezone_offset'),
  sportName: text('sport_name'),
  scoreState: text('score_state'),
  score: text('score'),
  during: text('during'),
  zoneDuration: text('zone_duration'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const whoopRecovery = sqliteTable('whoop_recovery', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  whoopRecoveryId: text('whoop_recovery_id').notNull().unique(),
  cycleId: text('cycle_id'),
  date: integer('date', { mode: 'timestamp_ms' }).notNull(),
  recoveryScore: integer('recovery_score'),
  hrvRmssdMilli: real('hrv_rmssd_milli'),
  hrvRmssdBaseline: real('hrv_rmssd_baseline'),
  restingHeartRate: integer('resting_heart_rate'),
  restingHeartRateBaseline: integer('resting_heart_rate_baseline'),
  respiratoryRate: real('respiratory_rate'),
  respiratoryRateBaseline: real('respiratory_rate_baseline'),
  rawData: text('raw_data'),
  recoveryScoreTier: text('recovery_score_tier'),
  timezoneOffset: text('timezone_offset'),
  webhookReceivedAt: integer('webhook_received_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const whoopCycle = sqliteTable('whoop_cycle', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  whoopCycleId: text('whoop_cycle_id').notNull().unique(),
  start: integer('start', { mode: 'timestamp_ms' }).notNull(),
  end: integer('end', { mode: 'timestamp_ms' }).notNull(),
  timezoneOffset: text('timezone_offset'),
  dayStrain: real('day_strain'),
  averageHeartRate: integer('average_heart_rate'),
  maxHeartRate: integer('max_heart_rate'),
  kilojoule: real('kilojoule'),
  percentRecorded: real('percent_recorded'),
  distanceMeter: integer('distance_meter'),
  altitudeGainMeter: integer('altitude_gain_meter'),
  altitudeChangeMeter: integer('altitude_change_meter'),
  rawData: text('raw_data'),
  webhookReceivedAt: integer('webhook_received_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const whoopSleep = sqliteTable('whoop_sleep', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  whoopSleepId: text('whoop_sleep_id').notNull().unique(),
  start: integer('start', { mode: 'timestamp_ms' }).notNull(),
  end: integer('end', { mode: 'timestamp_ms' }).notNull(),
  timezoneOffset: text('timezone_offset'),
  sleepPerformancePercentage: integer('sleep_performance_percentage'),
  totalSleepTimeMilli: integer('total_sleep_time_milli'),
  sleepEfficiencyPercentage: real('sleep_efficiency_percentage'),
  slowWaveSleepTimeMilli: integer('slow_wave_sleep_time_milli'),
  remSleepTimeMilli: integer('rem_sleep_time_milli'),
  lightSleepTimeMilli: integer('light_sleep_time_milli'),
  wakeTimeMilli: integer('wake_time_milli'),
  arousalTimeMilli: integer('arousal_time_milli'),
  disturbanceCount: integer('disturbance_count'),
  sleepLatencyMilli: integer('sleep_latency_milli'),
  sleepConsistencyPercentage: real('sleep_consistency_percentage'),
  sleepNeedBaselineMilli: integer('sleep_need_baseline_milli'),
  sleepNeedFromSleepDebtMilli: integer('sleep_need_from_sleep_debt_milli'),
  sleepNeedFromRecentStrainMilli: integer('sleep_need_from_recent_strain_milli'),
  sleepNeedFromRecentNapMilli: integer('sleep_need_from_recent_nap_milli'),
  rawData: text('raw_data'),
  sleepQualityTier: text('sleep_quality_tier'),
  webhookReceivedAt: integer('webhook_received_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const whoopBodyMeasurement = sqliteTable('whoop_body_measurement', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  whoopMeasurementId: text('whoop_measurement_id').notNull().unique(),
  heightMeter: real('height_meter'),
  weightKilogram: real('weight_kilogram'),
  maxHeartRate: integer('max_heart_rate'),
  measurementDate: integer('measurement_date', { mode: 'timestamp_ms' }),
  rawData: text('raw_data'),
  webhookReceivedAt: integer('webhook_received_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const tokenRefreshLock = sqliteTable('token_refresh_lock', {
  integrationId: text('integration_id').primaryKey(),
  lockedAt: integer('locked_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

export const webhookEventLog = sqliteTable('webhook_event_log', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp_ms' }).notNull(),
});

export const rateLimit = sqliteTable('rate_limit', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  requests: integer('requests').notNull().default(0),
  windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const _whoopProfileUserIdIdx = index('idx_whoop_profile_user_id').on(whoopProfile.userId);

export const _whoopWorkoutUserIdStartIdx = index('idx_whoop_workout_user_id_start').on(
  whoopWorkout.userId,
  whoopWorkout.start,
);

export const _whoopRecoveryUserIdDateIdx = index('idx_whoop_recovery_user_id_date').on(
  whoopRecovery.userId,
  whoopRecovery.date,
);
export const _whoopRecoveryCycleIdIdx = index('idx_whoop_recovery_cycle_id').on(
  whoopRecovery.cycleId,
);

export const _whoopCycleUserIdStartIdx = index('idx_whoop_cycle_user_id_start').on(
  whoopCycle.userId,
  whoopCycle.start,
);

export const _whoopSleepUserIdStartIdx = index('idx_whoop_sleep_user_id_start').on(
  whoopSleep.userId,
  whoopSleep.start,
);
export const _whoopSleepUserIdSleepPerformanceIdx = index(
  'idx_whoop_sleep_user_id_sleep_performance',
).on(whoopSleep.userId, whoopSleep.sleepPerformancePercentage);

export const _whoopBodyMeasurementUserIdMeasurementDateIdx = index(
  'idx_whoop_body_measurement_user_id_measurement_date',
).on(whoopBodyMeasurement.userId, whoopBodyMeasurement.measurementDate);

export const _rateLimitWindowStartIdx = index('idx_rate_limit_window_start').on(
  rateLimit.windowStart,
);
export const _rateLimitUserIdEndpointUniqueIdx = uniqueIndex(
  'rate_limit_user_id_endpoint_unique',
).on(rateLimit.userId, rateLimit.endpoint);

export const nutritionEntries = sqliteTable(
  'nutrition_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mealType: text('meal_type'),
    name: text('name'),
    calories: real('calories'),
    proteinG: real('protein_g'),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    aiAnalysis: text('ai_analysis'),
    loggedAt: integer('logged_at', { mode: 'timestamp_ms' }).notNull(),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_nutrition_entries_query').on(t.userId, t.isDeleted, t.loggedAt)],
);

export const nutritionChatMessages = sqliteTable(
  'nutrition_chat_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    hasImage: integer('has_image', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_nutrition_chat_messages_user_id_created_at').on(t.userId, t.createdAt)],
);

export const nutritionChatJobs = sqliteTable(
  'nutrition_chat_jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    error: text('error'),
    messagesJson: text('messages_json').notNull(),
    date: text('date').notNull(),
    hasImage: integer('has_image', { mode: 'boolean' }).default(false),
    imageBase64: text('image_base64'),
    assistantMessageId: text('assistant_message_id'),
    syncOperationId: text('sync_operation_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_nutrition_chat_jobs_user_status_created').on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex('nutrition_chat_jobs_user_id_sync_operation_id_unique').on(
      table.userId,
      table.syncOperationId,
    ),
  ],
);

export const userBodyStats = sqliteTable('user_body_stats', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  bodyweightKg: real('bodyweight_kg'),
  heightCm: real('height_cm'),
  targetCalories: integer('target_calories'),
  targetProteinG: integer('target_protein_g'),
  targetCarbsG: integer('target_carbs_g'),
  targetFatG: integer('target_fat_g'),
  recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const nutritionTrainingContext = sqliteTable(
  'nutrition_training_context',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trainingType: text('training_type').notNull(),
    customLabel: text('custom_label'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique('nutrition_training_context_user_id_unique').on(t.userId)],
);
