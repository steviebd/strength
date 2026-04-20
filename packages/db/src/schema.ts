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
