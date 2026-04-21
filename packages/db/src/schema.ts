import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export function generateId(): string {
  return crypto.randomUUID();
}

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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const session = sqliteTable('session', {
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
});

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

export const exercises = sqliteTable('exercises', {
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
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const templates = sqliteTable('templates', {
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
});

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
  isAmrap: integer('is_amrap', { mode: 'boolean' }).default(false),
  isAccessory: integer('is_accessory', { mode: 'boolean' }).default(false),
  isRequired: integer('is_required', { mode: 'boolean' }).default(true),
  setNumber: integer('set_number'),
});

export const workouts = sqliteTable('workouts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  templateId: text('template_id').references(() => templates.id, { onDelete: 'set null' }),
  programCycleId: text('program_cycle_id'),
  name: text('name').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  completedDate: text('completed_date'),
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
});

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

export const workoutSets = sqliteTable('workout_sets', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  workoutExerciseId: text('workout_exercise_id')
    .notNull()
    .references(() => workoutExercises.id, { onDelete: 'cascade' }),
  setNumber: integer('set_number').notNull(),
  weight: real('weight'),
  reps: integer('reps'),
  rpe: real('rpe'),
  isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const userProgramCycles = sqliteTable('user_program_cycles', {
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
  programStartDate: text('program_start_date'),
  firstSessionDate: text('first_session_date'),
});

export const programCycleWorkouts = sqliteTable('program_cycle_workouts', {
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
  scheduledDate: text('scheduled_date'),
  scheduledTime: text('scheduled_time'),
});

export const _exercisesUserIdUpdatedAtIdx = index('idx_exercises_user_id_updated_at').on(
  exercises.userId,
  exercises.updatedAt,
);
export const _exercisesMuscleGroupIdx = index('idx_exercises_muscle_group').on(
  exercises.muscleGroup,
);

export const _templatesUserIdUpdatedAtIdx = index('idx_templates_user_id_updated_at').on(
  templates.userId,
  templates.updatedAt,
);

export const _workoutsUserIdStartedAtIdx = index('idx_workouts_user_id_started_at').on(
  workouts.userId,
  workouts.startedAt,
);
export const _workoutsTemplateIdIdx = index('idx_workouts_template_id').on(workouts.templateId);
export const _workoutsCompletedAtIdx = index('idx_workouts_completed_at').on(workouts.completedAt);

export const _workoutExercisesOrderIdx = index('idx_workout_exercises_order').on(
  workoutExercises.workoutId,
  workoutExercises.orderIndex,
);
export const _workoutExercisesExerciseIdIdx = index('idx_workout_exercises_exercise_id').on(
  workoutExercises.exerciseId,
);

export const _workoutSetsWorkoutExerciseIdIdx = index('idx_workout_sets_workout_exercise_id').on(
  workoutSets.workoutExerciseId,
);
export const _workoutSetsCompletedAtIdx = index('idx_workout_sets_completed_at').on(
  workoutSets.completedAt,
);

export const _userProgramCyclesUserIdIdx = index('idx_user_program_cycles_user_id').on(
  userProgramCycles.userId,
);

export const _programCycleWorkoutsCycleIdIdx = index('idx_program_cycle_workouts_cycle_id').on(
  programCycleWorkouts.cycleId,
);
export const _programCycleWorkoutsScheduledDateIdx = index(
  'idx_program_cycle_workouts_scheduled_date',
).on(programCycleWorkouts.scheduledDate);

export const _templateExercisesTemplateIdIdx = index('idx_template_exercises_template_id').on(
  templateExercises.templateId,
);

export const userIntegration = sqliteTable('user_integration', {
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
});

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

export const rateLimit = sqliteTable('rate_limit', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  requests: integer('requests').notNull().default(0),
  windowStart: text('window_start').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const _userIntegrationUserIdIdx = index('idx_user_integration_user_id').on(
  userIntegration.userId,
);
export const _userIntegrationProviderIdx = index('idx_user_integration_provider').on(
  userIntegration.provider,
);
export const _userIntegrationUserIdProviderIdx = index('idx_user_integration_user_id_provider').on(
  userIntegration.userId,
  userIntegration.provider,
);

export const _whoopProfileUserIdIdx = index('idx_whoop_profile_user_id').on(whoopProfile.userId);
export const _whoopProfileWhoopUserIdIdx = index('idx_whoop_profile_whoop_user_id').on(
  whoopProfile.whoopUserId,
);

export const _whoopWorkoutUserIdIdx = index('idx_whoop_workout_user_id').on(whoopWorkout.userId);
export const _whoopWorkoutWhoopWorkoutIdIdx = index('idx_whoop_workout_whoop_workout_id').on(
  whoopWorkout.whoopWorkoutId,
);
export const _whoopWorkoutStartIdx = index('idx_whoop_workout_start').on(whoopWorkout.start);
export const _whoopWorkoutUserIdStartIdx = index('idx_whoop_workout_user_id_start').on(
  whoopWorkout.userId,
  whoopWorkout.start,
);

export const _whoopRecoveryUserIdIdx = index('idx_whoop_recovery_user_id').on(whoopRecovery.userId);
export const _whoopRecoveryWhoopRecoveryIdIdx = index('idx_whoop_recovery_whoop_recovery_id').on(
  whoopRecovery.whoopRecoveryId,
);
export const _whoopRecoveryDateIdx = index('idx_whoop_recovery_date').on(whoopRecovery.date);
export const _whoopRecoveryUserIdDateIdx = index('idx_whoop_recovery_user_id_date').on(
  whoopRecovery.userId,
  whoopRecovery.date,
);
export const _whoopRecoveryCycleIdIdx = index('idx_whoop_recovery_cycle_id').on(
  whoopRecovery.cycleId,
);

export const _whoopCycleUserIdIdx = index('idx_whoop_cycle_user_id').on(whoopCycle.userId);
export const _whoopCycleWhoopCycleIdIdx = index('idx_whoop_cycle_whoop_cycle_id').on(
  whoopCycle.whoopCycleId,
);
export const _whoopCycleStartIdx = index('idx_whoop_cycle_start').on(whoopCycle.start);
export const _whoopCycleUserIdStartIdx = index('idx_whoop_cycle_user_id_start').on(
  whoopCycle.userId,
  whoopCycle.start,
);
export const _whoopCycleDayStrainIdx = index('idx_whoop_cycle_day_strain').on(whoopCycle.dayStrain);

export const _whoopSleepUserIdIdx = index('idx_whoop_sleep_user_id').on(whoopSleep.userId);
export const _whoopSleepWhoopSleepIdIdx = index('idx_whoop_sleep_whoop_sleep_id').on(
  whoopSleep.whoopSleepId,
);
export const _whoopSleepStartIdx = index('idx_whoop_sleep_start').on(whoopSleep.start);
export const _whoopSleepUserIdStartIdx = index('idx_whoop_sleep_user_id_start').on(
  whoopSleep.userId,
  whoopSleep.start,
);
export const _whoopSleepUserIdSleepPerformanceIdx = index(
  'idx_whoop_sleep_user_id_sleep_performance',
).on(whoopSleep.userId, whoopSleep.sleepPerformancePercentage);

export const _whoopBodyMeasurementUserIdIdx = index('idx_whoop_body_measurement_user_id').on(
  whoopBodyMeasurement.userId,
);
export const _whoopBodyMeasurementWhoopMeasurementIdIdx = index(
  'idx_whoop_body_measurement_whoop_measurement_id',
).on(whoopBodyMeasurement.whoopMeasurementId);
export const _whoopBodyMeasurementMeasurementDateIdx = index(
  'idx_whoop_body_measurement_measurement_date',
).on(whoopBodyMeasurement.measurementDate);
export const _whoopBodyMeasurementUserIdMeasurementDateIdx = index(
  'idx_whoop_body_measurement_user_id_measurement_date',
).on(whoopBodyMeasurement.userId, whoopBodyMeasurement.measurementDate);

export const _rateLimitUserIdEndpointIdx = index('idx_rate_limit_user_id_endpoint').on(
  rateLimit.userId,
  rateLimit.endpoint,
);
export const _rateLimitWindowStartIdx = index('idx_rate_limit_window_start').on(
  rateLimit.windowStart,
);

export const nutritionEntries = sqliteTable('nutrition_entries', {
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
  loggedAt: text('logged_at').notNull(),
  date: text('date').notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const nutritionChatMessages = sqliteTable('nutrition_chat_messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  hasImage: integer('has_image', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

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

export const nutritionTrainingContext = sqliteTable('nutrition_training_context', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  trainingType: text('training_type').notNull(),
  customLabel: text('custom_label'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const _nutritionEntriesUserDateIdx = index('idx_nutrition_entries_user_date').on(
  nutritionEntries.userId,
  nutritionEntries.date,
);
export const _nutritionEntriesUserDeletedIdx = index('idx_nutrition_entries_user_deleted').on(
  nutritionEntries.userId,
  nutritionEntries.isDeleted,
);
export const _nutritionChatMessagesUserDateIdx = index('idx_nutrition_chat_messages_user_date').on(
  nutritionChatMessages.userId,
  nutritionChatMessages.date,
);
export const _userBodyStatsUserIdx = index('idx_user_body_stats_user').on(userBodyStats.userId);
export const _nutritionTrainingContextUserDateIdx = index(
  'idx_nutrition_training_context_user_date',
).on(nutritionTrainingContext.userId, nutritionTrainingContext.date);
