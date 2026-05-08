import { and, desc, eq, inArray, isNotNull, isNull, like } from 'drizzle-orm';
import {
  createProgramAdvancePlan,
  createProgramStartPlan,
  computeStreak,
  formatLocalDate,
  getCurrentCycleWorkout,
  getUtcRangeForLocalDate,
  getWeekRange,
  groupConsecutiveExercises,
  parseProgramTargetLifts,
  type ProgramStartPayload,
} from '@strength/db/client';
import { getLocalDb, withLocalTransaction } from './client';
import {
  localProgramCycleWorkouts,
  localProgramCycles,
  localTemplateExercises,
  localTemplates,
  localTrainingCacheMeta,
  localUserExercises,
  localWorkouts,
  type LocalWorkout,
} from './local-schema';
import { normalizeTemplateExerciseForLocalCache, upsertServerWorkoutSnapshot } from './workouts';
import {
  getFreshLatestOneRMs,
  getLatestOneRMsFromLocalCycles,
  getLocallyDirtyProgramCycleIds,
  getPendingSyncedEntityIds,
  hasPendingEntity,
} from './training-read-model';
import type { Workout } from '@/context/WorkoutSessionContext';
import type { Template } from '@/components/template/TemplateEditor/types';
import { platformStorage } from '@/lib/platform-storage';
import { getCachedWhoopData } from './whoop';

const DIRTY_WORKOUT_STATUSES = ['pending', 'syncing', 'failed', 'conflict'];

function toDate(value: Date | string | number | null | undefined) {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string | number | null | undefined) {
  return toDate(value)?.toISOString() ?? null;
}

function toTime(value: Date | string | number | null | undefined) {
  return toDate(value)?.getTime() ?? null;
}

function isDirtyWorkout(row: LocalWorkout | undefined) {
  return Boolean(row && DIRTY_WORKOUT_STATUSES.includes(row.syncStatus));
}

export type OfflineTrainingSnapshot = {
  generatedAt: string;
  templates: any[];
  userExercises: any[];
  activeProgramCycles: Array<{ cycle: any; workouts: any[] }>;
  recentWorkouts: Workout[];
};

export async function hydrateOfflineTrainingSnapshot(
  userId: string,
  snapshot: OfflineTrainingSnapshot,
) {
  const db = getLocalDb();
  if (!db) return;

  const pendingSyncIds = getPendingSyncedEntityIds(userId);
  const locallyDirtyProgramCycleIds = getLocallyDirtyProgramCycleIds(userId);
  const hydratedAt = new Date();
  const generatedAt = toDate(snapshot.generatedAt);
  const serverTemplateIds = new Set(snapshot.templates.map((template) => template.id));
  const activeCycleIds = new Set(snapshot.activeProgramCycles.map((entry) => entry.cycle.id));

  const existingLocalTemplates = db
    .select({
      id: localTemplates.id,
      isDeleted: localTemplates.isDeleted,
      createdLocally: localTemplates.createdLocally,
    })
    .from(localTemplates)
    .where(eq(localTemplates.userId, userId))
    .all();
  const localTemplateMap = new Map(existingLocalTemplates.map((t) => [t.id, t]));
  const activeDraftRows = db
    .select({
      id: localWorkouts.id,
      cycleWorkoutId: localWorkouts.cycleWorkoutId,
    })
    .from(localWorkouts)
    .where(
      and(
        eq(localWorkouts.userId, userId),
        eq(localWorkouts.isDeleted, false),
        isNull(localWorkouts.completedAt),
        eq(localWorkouts.syncStatus, 'local'),
        isNotNull(localWorkouts.cycleWorkoutId),
      ),
    )
    .all();
  const activeDraftByCycleWorkoutId = new Map(
    activeDraftRows
      .filter((row) => row.cycleWorkoutId)
      .map((row) => [row.cycleWorkoutId as string, row.id]),
  );

  withLocalTransaction(() => {
    for (const template of snapshot.templates) {
      const localTemplate = localTemplateMap.get(template.id);
      if (localTemplate?.isDeleted && pendingSyncIds.has(template.id)) {
        continue;
      }

      db.insert(localTemplates)
        .values({
          id: template.id,
          userId,
          name: template.name,
          description: template.description ?? null,
          notes: template.notes ?? null,
          defaultWeightIncrement: template.defaultWeightIncrement ?? null,
          defaultBodyweightIncrement: template.defaultBodyweightIncrement ?? null,
          defaultCardioIncrement: template.defaultCardioIncrement ?? null,
          defaultTimedIncrement: template.defaultTimedIncrement ?? null,
          defaultPlyoIncrement: template.defaultPlyoIncrement ?? null,
          isDeleted: false,
          createdLocally: false,
          createdAt: toDate(template.createdAt),
          updatedAt: toDate(template.updatedAt),
          serverUpdatedAt: toDate(template.updatedAt),
          hydratedAt,
        })
        .onConflictDoUpdate({
          target: localTemplates.id,
          set: {
            name: template.name,
            description: template.description ?? null,
            notes: template.notes ?? null,
            defaultWeightIncrement: template.defaultWeightIncrement ?? null,
            defaultBodyweightIncrement: template.defaultBodyweightIncrement ?? null,
            defaultCardioIncrement: template.defaultCardioIncrement ?? null,
            defaultTimedIncrement: template.defaultTimedIncrement ?? null,
            defaultPlyoIncrement: template.defaultPlyoIncrement ?? null,
            isDeleted: false,
            createdLocally: false,
            updatedAt: toDate(template.updatedAt),
            serverUpdatedAt: toDate(template.updatedAt),
            hydratedAt,
          },
        })
        .run();

      db.delete(localTemplateExercises)
        .where(eq(localTemplateExercises.templateId, template.id))
        .run();
      for (const exercise of template.exercises ?? []) {
        db.insert(localTemplateExercises)
          .values(normalizeTemplateExerciseForLocalCache(template.id, exercise))
          .run();
      }
    }

    const orphanedTemplateIds = existingLocalTemplates
      .filter((template) => !serverTemplateIds.has(template.id) && !pendingSyncIds.has(template.id))
      .map((template) => template.id);
    if (orphanedTemplateIds.length > 0) {
      db.update(localTemplates)
        .set({ isDeleted: true, hydratedAt })
        .where(inArray(localTemplates.id, orphanedTemplateIds))
        .run();
    }
  });

  withLocalTransaction(() => {
    for (const exercise of snapshot.userExercises) {
      db.insert(localUserExercises)
        .values({
          id: exercise.id,
          userId,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup ?? null,
          description: exercise.description ?? null,
          libraryId: exercise.libraryId ?? null,
          exerciseType: exercise.exerciseType ?? 'weights',
          isAmrap: exercise.isAmrap ?? false,
          createdLocally: false,
          createdAt: toDate(exercise.createdAt),
          updatedAt: toDate(exercise.updatedAt),
          serverUpdatedAt: toDate(exercise.updatedAt),
          hydratedAt,
        })
        .onConflictDoUpdate({
          target: localUserExercises.id,
          set: {
            name: exercise.name,
            muscleGroup: exercise.muscleGroup ?? null,
            description: exercise.description ?? null,
            libraryId: exercise.libraryId ?? null,
            exerciseType: exercise.exerciseType ?? 'weights',
            isAmrap: exercise.isAmrap ?? false,
            createdLocally: false,
            updatedAt: toDate(exercise.updatedAt),
            serverUpdatedAt: toDate(exercise.updatedAt),
            hydratedAt,
          },
        })
        .run();
    }
  });

  withLocalTransaction(() => {
    for (const entry of snapshot.activeProgramCycles) {
      const cycle = entry.cycle;
      const hasPendingSyncWorkout = (entry.workouts ?? []).some((w) => pendingSyncIds.has(w.id));
      if (hasPendingSyncWorkout || locallyDirtyProgramCycleIds.has(cycle.id)) {
        continue;
      }

      db.insert(localProgramCycles)
        .values({
          id: cycle.id,
          userId,
          programSlug: cycle.programSlug,
          name: cycle.name,
          squat1rm: cycle.squat1rm ?? null,
          bench1rm: cycle.bench1rm ?? null,
          deadlift1rm: cycle.deadlift1rm ?? null,
          ohp1rm: cycle.ohp1rm ?? null,
          startingSquat1rm: cycle.startingSquat1rm ?? null,
          startingBench1rm: cycle.startingBench1rm ?? null,
          startingDeadlift1rm: cycle.startingDeadlift1rm ?? null,
          startingOhp1rm: cycle.startingOhp1rm ?? null,
          currentWeek: cycle.currentWeek ?? null,
          currentSession: cycle.currentSession ?? null,
          totalSessionsCompleted: cycle.totalSessionsCompleted ?? 0,
          totalSessionsPlanned: cycle.totalSessionsPlanned,
          status: cycle.status ?? 'active',
          isComplete: cycle.isComplete ?? false,
          startedAt: toDate(cycle.startedAt),
          completedAt: toDate(cycle.completedAt),
          updatedAt: toDate(cycle.updatedAt),
          preferredGymDays: cycle.preferredGymDays ?? null,
          preferredTimeOfDay: cycle.preferredTimeOfDay ?? null,
          programStartAt: toDate(cycle.programStartAt),
          firstSessionAt: toDate(cycle.firstSessionAt),
          hydratedAt,
        })
        .onConflictDoUpdate({
          target: localProgramCycles.id,
          set: {
            name: cycle.name,
            currentWeek: cycle.currentWeek ?? null,
            currentSession: cycle.currentSession ?? null,
            totalSessionsCompleted: cycle.totalSessionsCompleted ?? 0,
            totalSessionsPlanned: cycle.totalSessionsPlanned,
            status: cycle.status ?? 'active',
            isComplete: cycle.isComplete ?? false,
            completedAt: toDate(cycle.completedAt),
            updatedAt: toDate(cycle.updatedAt),
            hydratedAt,
          },
        })
        .run();

      for (const workout of entry.workouts ?? []) {
        const preservedDraftWorkoutId = activeDraftByCycleWorkoutId.get(workout.id);
        db.insert(localProgramCycleWorkouts)
          .values({
            id: workout.id,
            cycleId: workout.cycleId,
            templateId: workout.templateId ?? null,
            weekNumber: workout.weekNumber,
            sessionNumber: workout.sessionNumber,
            sessionName: workout.sessionName,
            targetLifts: workout.targetLifts ?? null,
            isComplete: workout.isComplete ?? false,
            workoutId: preservedDraftWorkoutId ?? workout.workoutId ?? null,
            createdAt: toDate(workout.createdAt),
            updatedAt: toDate(workout.updatedAt),
            scheduledAt: toDate(workout.scheduledAt),
            serverUpdatedAt: toDate(workout.updatedAt),
            hydratedAt,
          })
          .onConflictDoUpdate({
            target: localProgramCycleWorkouts.id,
            set: {
              templateId: workout.templateId ?? null,
              sessionName: workout.sessionName,
              targetLifts: workout.targetLifts ?? null,
              isComplete: workout.isComplete ?? false,
              workoutId: preservedDraftWorkoutId ?? workout.workoutId ?? null,
              updatedAt: toDate(workout.updatedAt),
              scheduledAt: toDate(workout.scheduledAt),
              serverUpdatedAt: toDate(workout.updatedAt),
              hydratedAt,
            },
          })
          .run();
      }
    }

    const existingCycles = db
      .select({ id: localProgramCycles.id })
      .from(localProgramCycles)
      .where(and(eq(localProgramCycles.userId, userId), eq(localProgramCycles.status, 'active')))
      .all();
    const orphanedCycleIds = existingCycles
      .filter(
        (cycle) =>
          !activeCycleIds.has(cycle.id) &&
          !hasPendingEntity(pendingSyncIds, cycle.id) &&
          !locallyDirtyProgramCycleIds.has(cycle.id),
      )
      .map((cycle) => cycle.id);
    if (orphanedCycleIds.length > 0) {
      db.update(localProgramCycles)
        .set({ status: 'deleted', hydratedAt })
        .where(inArray(localProgramCycles.id, orphanedCycleIds))
        .run();
    }
  });

  for (const workout of snapshot.recentWorkouts ?? []) {
    const existing = db.select().from(localWorkouts).where(eq(localWorkouts.id, workout.id)).get();
    if (isDirtyWorkout(existing)) continue;
    if (pendingSyncIds.has(workout.id)) continue;
    await upsertServerWorkoutSnapshot(userId, workout);
  }

  withLocalTransaction(() => {
    db.insert(localTrainingCacheMeta)
      .values({ userId, cacheKey: 'offline-snapshot', hydratedAt, generatedAt })
      .onConflictDoUpdate({
        target: [localTrainingCacheMeta.userId, localTrainingCacheMeta.cacheKey],
        set: { hydratedAt, generatedAt },
      })
      .run();
  });
}

export async function getCachedTemplates(userId: string): Promise<Template[]> {
  const db = getLocalDb();
  if (!db) return [];
  const templates = db
    .select()
    .from(localTemplates)
    .where(and(eq(localTemplates.userId, userId), eq(localTemplates.isDeleted, false)))
    .orderBy(desc(localTemplates.createdAt))
    .all();
  return Promise.all(templates.map((template) => getCachedTemplate(template.id))).then((rows) =>
    rows.filter((row): row is Template => Boolean(row)),
  );
}

async function getCachedTemplate(templateId: string): Promise<Template | null> {
  const db = getLocalDb();
  if (!db) return null;
  const template = db.select().from(localTemplates).where(eq(localTemplates.id, templateId)).get();
  if (!template || template.isDeleted) return null;
  const exercises = db
    .select()
    .from(localTemplateExercises)
    .where(eq(localTemplateExercises.templateId, templateId))
    .orderBy(localTemplateExercises.orderIndex)
    .all();
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    notes: template.notes,
    defaultWeightIncrement: template.defaultWeightIncrement,
    defaultBodyweightIncrement: template.defaultBodyweightIncrement,
    defaultCardioIncrement: template.defaultCardioIncrement,
    defaultTimedIncrement: template.defaultTimedIncrement,
    defaultPlyoIncrement: template.defaultPlyoIncrement,
    createdAt: toIso(template.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(template.updatedAt) ?? new Date().toISOString(),
    exercises: exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      sets: exercise.sets ?? 3,
      reps: exercise.reps ?? 10,
      repsRaw: exercise.repsRaw ?? null,
      targetWeight: exercise.targetWeight ?? 0,
      addedWeight: exercise.addedWeight ?? 0,
      exerciseType: exercise.exerciseType ?? 'weights',
      targetDuration: exercise.targetDuration ?? null,
      targetDistance: exercise.targetDistance ?? null,
      targetHeight: exercise.targetHeight ?? null,
      isAmrap: Boolean(exercise.isAmrap),
      isAccessory: Boolean(exercise.isAccessory),
      isRequired: Boolean(exercise.isRequired),
      orderIndex: exercise.orderIndex,
    })),
  };
}

export async function getCachedUserExercises(userId: string, search?: string) {
  const db = getLocalDb();
  if (!db) return [];
  const query = search?.trim();
  return db
    .select()
    .from(localUserExercises)
    .where(
      query
        ? and(eq(localUserExercises.userId, userId), like(localUserExercises.name, `%${query}%`))
        : eq(localUserExercises.userId, userId),
    )
    .orderBy(desc(localUserExercises.createdAt))
    .all();
}

export async function getCachedActivePrograms(userId: string) {
  const db = getLocalDb();
  if (!db) return [];
  return db
    .select()
    .from(localProgramCycles)
    .where(and(eq(localProgramCycles.userId, userId), eq(localProgramCycles.status, 'active')))
    .orderBy(desc(localProgramCycles.startedAt))
    .all();
}

async function getCachedProgramCycleWithWorkouts(userId: string, cycleId: string) {
  const db = getLocalDb();
  if (!db) return null;
  const cycle = db
    .select()
    .from(localProgramCycles)
    .where(and(eq(localProgramCycles.id, cycleId), eq(localProgramCycles.userId, userId)))
    .get();
  if (!cycle) return null;
  const workouts = db
    .select()
    .from(localProgramCycleWorkouts)
    .where(eq(localProgramCycleWorkouts.cycleId, cycleId))
    .orderBy(localProgramCycleWorkouts.weekNumber, localProgramCycleWorkouts.sessionNumber)
    .all();
  return { cycle, workouts };
}

export async function getCachedProgramSchedule(userId: string, cycleId: string, timezone = 'UTC') {
  const result = await getCachedProgramCycleWithWorkouts(userId, cycleId);
  if (!result) return null;
  const localDate = formatLocalDate(new Date(), timezone);
  const { start: todayStart, end: todayEnd } = getUtcRangeForLocalDate(localDate, timezone);
  const thisWeek: any[] = [];
  const upcoming: any[] = [];
  const completed: any[] = [];
  for (const workout of result.workouts) {
    const parsed = parseProgramTargetLifts(workout.targetLifts);
    const row = {
      cycleWorkoutId: workout.id,
      workoutId: workout.workoutId ?? null,
      weekNumber: workout.weekNumber,
      sessionNumber: workout.sessionNumber,
      name: workout.sessionName,
      exercises: parsed.all.map((lift) => lift.name),
      scheduledAt: toTime(workout.scheduledAt),
      status: 'upcoming',
    };
    if (workout.isComplete) completed.push({ ...row, status: 'complete' });
    else if (!workout.scheduledAt) upcoming.push({ ...row, status: 'unscheduled' });
    else {
      const scheduledAt = toTime(workout.scheduledAt) ?? 0;
      if (scheduledAt >= todayStart.getTime() && scheduledAt < todayEnd.getTime()) {
        thisWeek.push({ ...row, status: 'today' });
      } else if (scheduledAt < todayStart.getTime()) {
        thisWeek.push({ ...row, status: 'missed' });
      } else {
        upcoming.push(row);
      }
    }
  }
  return {
    cycle: {
      id: result.cycle.id,
      name: result.cycle.name,
      currentWeek: result.cycle.currentWeek,
      currentSession: result.cycle.currentSession,
      totalSessionsCompleted: result.cycle.totalSessionsCompleted,
      totalSessionsPlanned: result.cycle.totalSessionsPlanned,
    },
    thisWeek,
    upcoming,
    completed,
  };
}

async function buildLocalRecoverySnapshot(userId: string, timezone: string) {
  const today = formatLocalDate(new Date(), timezone);
  const cached = await getCachedWhoopData(userId, today, timezone);
  if (cached) {
    return {
      sleepDurationLabel: cached.data.sleepDurationLabel,
      sleepPerformancePercentage: cached.data.sleepPerformancePercentage,
      recoveryScore: cached.data.recoveryScore,
      recoveryStatus: cached.data.status,
      strain: cached.data.totalStrain,
      isWhoopConnected: cached.data.isWhoopConnected,
    };
  }
  return {
    sleepDurationLabel: null,
    sleepPerformancePercentage: null,
    recoveryScore: null,
    recoveryStatus: null,
    strain: null,
    isWhoopConnected: false,
  };
}

export async function buildLocalHomeSummary(userId: string, timezone = 'UTC') {
  const activePrograms = await getCachedActivePrograms(userId);
  const activeCycle = activePrograms[0] ?? null;
  const latestOneRMs = activeCycle ? null : await getFallbackLatestOneRMsFromCycles(userId);
  let workout: any = null;
  let nextWorkout: any = null;
  if (activeCycle) {
    const data = await getCachedProgramCycleWithWorkouts(userId, activeCycle.id);
    const current = data ? getCurrentCycleWorkout(activeCycle, data.workouts) : null;
    if (current) {
      const parsed = parseProgramTargetLifts(current.targetLifts);
      const exercises = groupConsecutiveExercises(parsed.all);
      const row = {
        cycleWorkoutId: current.id,
        workoutId: current.workoutId ?? null,
        name: current.sessionName,
        focus: exercises[0]?.name ?? '',
        exercises,
        programName: activeCycle.name,
        programCycleId: activeCycle.id,
        scheduledAt: toTime(current.scheduledAt),
        isComplete: Boolean(current.isComplete),
      };
      if (current.scheduledAt) workout = row;
      else
        nextWorkout = {
          cycleWorkoutId: current.id,
          name: current.sessionName,
          programName: activeCycle.name,
          scheduledAt: null,
        };
    }
  }
  const recent = await getCachedRecentWorkoutHistory(userId, 50);
  const today = formatLocalDate(new Date(), timezone);

  const { weekStart, weekEnd } = getWeekRange(today);
  const { start: weekStartUtc } = getUtcRangeForLocalDate(weekStart, timezone);
  const { end: weekEndUtc } = getUtcRangeForLocalDate(weekEnd, timezone);

  const weeklyWorkouts = recent.filter((item) => {
    if (!item.completedAt) return false;
    const completedMs = item.completedAt.getTime();
    return completedMs >= weekStartUtc.getTime() && completedMs <= weekEndUtc.getTime();
  });

  const workoutDates = new Set(
    recent
      .map((item) =>
        item.completedAt ? formatLocalDate(new Date(item.completedAt), timezone) : null,
      )
      .filter((d): d is string => d !== null),
  );
  const streakDays = computeStreak(today, workoutDates);

  const weekVolume = weeklyWorkouts.reduce((sum, item) => sum + (item.totalVolume ?? 0), 0);

  const weightUnit = 'kg';
  const displayVolume = weekVolume;
  const totalVolumeLabel =
    displayVolume > 1000
      ? `${Math.round(displayVolume / 1000)}k ${weightUnit}`
      : `${Math.round(displayVolume)} ${weightUnit}`;

  return {
    date: {
      localDate: today,
      timezone,
      formatted: new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      }),
    },
    todayWorkout: {
      workout,
      nextWorkout,
      hasActiveProgram: Boolean(activeCycle),
      isRestDay: Boolean(activeCycle && !workout),
    },
    weeklyStats: {
      workoutsCompleted: weeklyWorkouts.length,
      workoutsTarget: 3,
      streakDays,
      totalVolume: weekVolume,
      totalVolumeLabel,
    },
    oneRepMaxes: {
      squat: activeCycle?.squat1rm ?? latestOneRMs?.squat1rm ?? null,
      bench: activeCycle?.bench1rm ?? latestOneRMs?.bench1rm ?? null,
      deadlift: activeCycle?.deadlift1rm ?? latestOneRMs?.deadlift1rm ?? null,
      ohp: activeCycle?.ohp1rm ?? latestOneRMs?.ohp1rm ?? null,
    },
    recoverySnapshot: await buildLocalRecoverySnapshot(userId, timezone),
  };
}

async function getCachedRecentWorkoutHistory(userId: string, limit = 50) {
  const db = getLocalDb();
  if (!db) return [];
  return db
    .select()
    .from(localWorkouts)
    .where(
      and(
        eq(localWorkouts.userId, userId),
        eq(localWorkouts.isDeleted, false),
        isNotNull(localWorkouts.completedAt),
      ),
    )
    .orderBy(desc(localWorkouts.startedAt))
    .limit(limit)
    .all();
}

export async function markLocalProgramAdvance(input: {
  programCycleId: string;
  completedCycleWorkoutId?: string | null;
  workoutId?: string | null;
  currentWeek?: number | null;
  currentSession?: number | null;
  status?: string | null;
}) {
  const db = getLocalDb();
  if (!db) return;
  const now = new Date();
  if (input.completedCycleWorkoutId) {
    db.update(localProgramCycleWorkouts)
      .set({ isComplete: true, workoutId: input.workoutId ?? null, hydratedAt: now })
      .where(eq(localProgramCycleWorkouts.id, input.completedCycleWorkoutId))
      .run();
  }
  db.update(localProgramCycles)
    .set({
      currentWeek: input.currentWeek ?? null,
      currentSession: input.currentSession ?? null,
      status: input.status ?? 'active',
      updatedAt: now,
      hydratedAt: now,
    })
    .where(eq(localProgramCycles.id, input.programCycleId))
    .run();
}

export async function createLocalProgramCycleFromStartPayload(
  userId: string,
  payload: ProgramStartPayload,
) {
  const db = getLocalDb();
  if (!db) return null;

  const plan = createProgramStartPlan(payload);
  const now = new Date();

  withLocalTransaction(() => {
    db.insert(localProgramCycles)
      .values({
        id: plan.cycle.id,
        userId,
        programSlug: plan.cycle.programSlug,
        name: plan.cycle.name,
        squat1rm: plan.cycle.squat1rm,
        bench1rm: plan.cycle.bench1rm,
        deadlift1rm: plan.cycle.deadlift1rm,
        ohp1rm: plan.cycle.ohp1rm,
        startingSquat1rm: plan.cycle.startingSquat1rm,
        startingBench1rm: plan.cycle.startingBench1rm,
        startingDeadlift1rm: plan.cycle.startingDeadlift1rm,
        startingOhp1rm: plan.cycle.startingOhp1rm,
        currentWeek: plan.cycle.currentWeek,
        currentSession: plan.cycle.currentSession,
        totalSessionsCompleted: plan.cycle.totalSessionsCompleted,
        totalSessionsPlanned: plan.cycle.totalSessionsPlanned,
        status: plan.cycle.status,
        isComplete: plan.cycle.isComplete,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
        preferredGymDays: JSON.stringify(plan.cycle.preferredGymDays),
        preferredTimeOfDay: plan.cycle.preferredTimeOfDay,
        programStartAt: plan.cycle.programStartAt,
        firstSessionAt: plan.cycle.firstSessionAt,
        hydratedAt: now,
      })
      .onConflictDoUpdate({
        target: localProgramCycles.id,
        set: {
          name: plan.cycle.name,
          currentWeek: plan.cycle.currentWeek,
          currentSession: plan.cycle.currentSession,
          totalSessionsCompleted: plan.cycle.totalSessionsCompleted,
          totalSessionsPlanned: plan.cycle.totalSessionsPlanned,
          status: plan.cycle.status,
          isComplete: plan.cycle.isComplete,
          updatedAt: now,
          hydratedAt: now,
        },
      })
      .run();

    for (const workout of plan.cycleWorkouts) {
      db.insert(localProgramCycleWorkouts)
        .values({
          id: workout.id,
          cycleId: workout.cycleId,
          templateId: workout.templateId,
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          sessionName: workout.sessionName,
          targetLifts: workout.targetLifts,
          isComplete: workout.isComplete,
          workoutId: workout.workoutId,
          createdAt: now,
          updatedAt: now,
          scheduledAt: workout.scheduledAt,
          serverUpdatedAt: null,
          hydratedAt: now,
        })
        .onConflictDoUpdate({
          target: localProgramCycleWorkouts.id,
          set: {
            sessionName: workout.sessionName,
            targetLifts: workout.targetLifts,
            isComplete: workout.isComplete,
            workoutId: workout.workoutId,
            updatedAt: now,
            scheduledAt: workout.scheduledAt,
            hydratedAt: now,
          },
        })
        .run();
    }
  });

  return plan;
}

export async function advanceLocalProgramCycleAfterWorkout(input: {
  userId: string;
  programCycleId: string;
  completedCycleWorkoutId: string;
  workoutId: string;
}) {
  const db = getLocalDb();
  if (!db) return null;

  const cycle = db
    .select()
    .from(localProgramCycles)
    .where(
      and(
        eq(localProgramCycles.id, input.programCycleId),
        eq(localProgramCycles.userId, input.userId),
      ),
    )
    .get();
  if (!cycle) return null;

  const workouts = db
    .select()
    .from(localProgramCycleWorkouts)
    .where(eq(localProgramCycleWorkouts.cycleId, input.programCycleId))
    .orderBy(localProgramCycleWorkouts.weekNumber, localProgramCycleWorkouts.sessionNumber)
    .all();
  if (workouts.length === 0) return null;

  let plan: ReturnType<typeof createProgramAdvancePlan>;
  try {
    plan = createProgramAdvancePlan({
      cycle,
      workouts,
      completedCycleWorkoutId: input.completedCycleWorkoutId,
      workoutId: input.workoutId,
    });
  } catch {
    return null;
  }
  const now = new Date();

  withLocalTransaction(() => {
    db.update(localProgramCycleWorkouts)
      .set({ isComplete: true, workoutId: input.workoutId, hydratedAt: now, updatedAt: now })
      .where(eq(localProgramCycleWorkouts.id, input.completedCycleWorkoutId))
      .run();

    db.update(localProgramCycles)
      .set({
        currentWeek: plan.currentWeek,
        currentSession: plan.currentSession,
        totalSessionsCompleted: plan.totalSessionsCompleted,
        status: plan.status,
        isComplete: plan.isComplete,
        completedAt: plan.isComplete ? now : null,
        updatedAt: now,
        hydratedAt: now,
      })
      .where(eq(localProgramCycles.id, input.programCycleId))
      .run();
  });

  return plan;
}

export async function updateLocalProgramCycleOneRMs(
  programCycleId: string,
  input: {
    squat1rm?: number | null;
    bench1rm?: number | null;
    deadlift1rm?: number | null;
    ohp1rm?: number | null;
    startingSquat1rm?: number | null;
    startingBench1rm?: number | null;
    startingDeadlift1rm?: number | null;
    startingOhp1rm?: number | null;
    isComplete?: boolean;
  },
) {
  const db = getLocalDb();
  if (!db) return;

  const now = new Date();
  const update: Record<string, unknown> = {
    updatedAt: now,
    hydratedAt: now,
  };

  for (const key of [
    'squat1rm',
    'bench1rm',
    'deadlift1rm',
    'ohp1rm',
    'startingSquat1rm',
    'startingBench1rm',
    'startingDeadlift1rm',
    'startingOhp1rm',
  ] as const) {
    if (input[key] !== undefined) {
      update[key] = input[key];
    }
  }

  if (input.isComplete === true) {
    update.isComplete = true;
    update.status = 'completed';
    update.completedAt = now;
  }

  db.update(localProgramCycles).set(update).where(eq(localProgramCycles.id, programCycleId)).run();
}

const PROGRAMS_CACHE_KEY = 'programs_catalog';
const ONERMS_CACHE_KEY = 'latest_1rms';

export async function getCachedProgramsCatalog(userId: string): Promise<any[] | null> {
  const json = await platformStorage.getItemAsync(`${PROGRAMS_CACHE_KEY}_${userId}`);
  return json ? JSON.parse(json) : null;
}

export async function cacheProgramsCatalog(userId: string, programs: any[]) {
  await platformStorage.setItemAsync(`${PROGRAMS_CACHE_KEY}_${userId}`, JSON.stringify(programs));
}

export async function getCachedLatestOneRMs(userId: string): Promise<any | null> {
  const json = await platformStorage.getItemAsync(`${ONERMS_CACHE_KEY}_${userId}`);
  return json ? JSON.parse(json) : null;
}

export async function cacheLatestOneRMs(userId: string, oneRMs: any | null) {
  if (oneRMs) {
    await platformStorage.setItemAsync(`${ONERMS_CACHE_KEY}_${userId}`, JSON.stringify(oneRMs));
  }
}

export async function getFallbackLatestOneRMsFromCycles(userId: string) {
  return getLatestOneRMsFromLocalCycles(userId);
}

export { getFreshLatestOneRMs };
