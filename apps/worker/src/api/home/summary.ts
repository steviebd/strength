import { eq, and, gte, lte, desc, isNotNull } from 'drizzle-orm';
import { formatLocalDate, addDaysToLocalDate, getWeekRange, computeStreak } from '@strength/db';
import { groupConsecutiveExercises, type GroupedExercise } from '@strength/db/client';
import * as schema from '@strength/db';
import { requireAuthContext } from '../auth';
import { resolveUserTimezone, getUtcRangeForLocalDate } from '../../lib/timezone';
import { getLatestOneRMsForUser } from '../../lib/program-helpers';

function parseTargetLifts(
  targetLifts: string | null | undefined,
): Array<{ name: string; libraryId?: string; lift?: string }> {
  if (!targetLifts) return [];
  if (Array.isArray(targetLifts)) return targetLifts;
  try {
    const parsed = JSON.parse(targetLifts);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as {
        exercises?: Array<{ name?: string; libraryId?: string; lift?: string }>;
        accessories?: Array<{ name?: string; libraryId?: string; lift?: string }>;
      };
      return [...(record.exercises ?? []), ...(record.accessories ?? [])]
        .filter((lift) => typeof lift?.name === 'string' && lift.name.length > 0)
        .map((lift) => ({ name: lift.name as string, libraryId: lift.libraryId, lift: lift.lift }));
    }
    return [];
  } catch {
    return [];
  }
}

function formatSleepDuration(milliseconds: number | null): string | null {
  if (milliseconds === null || milliseconds === undefined) {
    return null;
  }
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

type RecoveryStatus = 'green' | 'yellow' | 'red' | null;

function getRecoveryStatusTone(recoveryScore: number | null): RecoveryStatus {
  if (recoveryScore === null) return null;
  if (recoveryScore >= 67) return 'green';
  if (recoveryScore >= 40) return 'yellow';
  return 'red';
}

export async function recomputeHomeSummary(
  db: any,
  userId: string,
  requestedTimezone?: string | null,
) {
  const timezoneResult = await resolveUserTimezone(db, userId, requestedTimezone);
  const timezone = timezoneResult.timezone ?? 'UTC';
  const now = new Date();
  const localDate = formatLocalDate(now, timezone);

  const { weekStart, weekEnd } = getWeekRange(localDate);
  const { start: weekStartUtc } = getUtcRangeForLocalDate(weekStart, timezone);
  const { end: weekEndUtcEnd } = getUtcRangeForLocalDate(weekEnd, timezone);

  const lookbackStartLocal = addDaysToLocalDate(localDate, -365);
  const { start: rangeStart } = getUtcRangeForLocalDate(lookbackStartLocal, timezone);
  const { end: rangeEnd } = getUtcRangeForLocalDate(localDate, timezone);

  const [weekCompletedWorkouts, recentWorkouts, mostRecentWorkout] = await Promise.all([
    db
      .select({
        id: schema.workouts.id,
        totalVolume: schema.workouts.totalVolume,
      })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.userId, userId),
          eq(schema.workouts.isDeleted, false),
          isNotNull(schema.workouts.completedAt),
          gte(schema.workouts.completedAt, weekStartUtc),
          lte(schema.workouts.completedAt, weekEndUtcEnd),
        ),
      )
      .all(),
    db
      .select({ completedAt: schema.workouts.completedAt })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.userId, userId),
          eq(schema.workouts.isDeleted, false),
          isNotNull(schema.workouts.completedAt),
          gte(schema.workouts.completedAt, rangeStart),
          lte(schema.workouts.completedAt, rangeEnd),
        ),
      )
      .limit(500)
      .all(),
    db
      .select({ completedAt: schema.workouts.completedAt })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.userId, userId),
          eq(schema.workouts.isDeleted, false),
          isNotNull(schema.workouts.completedAt),
        ),
      )
      .orderBy(desc(schema.workouts.completedAt))
      .limit(1)
      .get(),
  ]);

  const workoutsCompleted = weekCompletedWorkouts.length;
  const totalVolume = (weekCompletedWorkouts as { totalVolume: number | null }[]).reduce(
    (sum, w) => sum + (w.totalVolume ?? 0),
    0,
  );

  const workoutDates = new Set(
    (recentWorkouts as { completedAt: Date | null }[])
      .map((w) => (w.completedAt ? formatLocalDate(new Date(w.completedAt), timezone) : null))
      .filter((d): d is string => d !== null),
  );
  const streakDays = computeStreak(localDate, workoutDates);

  const lastWorkoutDate = mostRecentWorkout?.completedAt
    ? new Date(mostRecentWorkout.completedAt)
    : null;

  await db
    .insert(schema.homeSummary)
    .values({
      userId,
      streakCount: streakDays,
      lastWorkoutDate,
      weeklyVolume: totalVolume,
      weeklyWorkouts: workoutsCompleted,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.homeSummary.userId,
      set: {
        streakCount: streakDays,
        lastWorkoutDate,
        weeklyVolume: totalVolume,
        weeklyWorkouts: workoutsCompleted,
        updatedAt: now,
      },
    })
    .run();
}

export async function homeSummaryHandler(c: any) {
  const auth = await requireAuthContext(c);
  if (auth instanceof Response) return auth;
  const { userId, db } = auth;

  const requestedTimezone = c.req.query('timezone') || null;
  const timezoneResult = await resolveUserTimezone(db, userId, requestedTimezone);
  const timezone = timezoneResult.timezone ?? 'UTC';
  const now = new Date();
  const localDate = formatLocalDate(now, timezone);

  const dateInfo = {
    localDate,
    timezone,
    formatted: new Date(localDate + 'T12:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    }),
  };

  const { weekStart, weekEnd } = getWeekRange(localDate);
  const { start: weekStartUtc } = getUtcRangeForLocalDate(weekStart, timezone);
  const { end: weekEndUtcEnd } = getUtcRangeForLocalDate(weekEnd, timezone);
  const { start: todayStart, end: todayEnd } = getUtcRangeForLocalDate(localDate, timezone);

  let cached = await db
    .select()
    .from(schema.homeSummary)
    .where(eq(schema.homeSummary.userId, userId))
    .get();

  let needsRecompute = !cached;
  if (cached) {
    const mostRecentWorkout = await db
      .select({ completedAt: schema.workouts.completedAt })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.userId, userId),
          eq(schema.workouts.isDeleted, false),
          isNotNull(schema.workouts.completedAt),
        ),
      )
      .orderBy(desc(schema.workouts.completedAt))
      .limit(1)
      .get();
    if (mostRecentWorkout?.completedAt && cached.updatedAt < mostRecentWorkout.completedAt) {
      needsRecompute = true;
    }
    if (!needsRecompute && cached.updatedAt < weekStartUtc) {
      needsRecompute = true;
    }
    if (!needsRecompute && cached.updatedAt < todayStart) {
      needsRecompute = true;
    }
  }

  if (needsRecompute) {
    try {
      await recomputeHomeSummary(db, userId, requestedTimezone);
      cached = await db
        .select()
        .from(schema.homeSummary)
        .where(eq(schema.homeSummary.userId, userId))
        .get();
    } catch {
      // ignore recompute failures and continue with stale or missing cache
    }
  }

  const activeCycles = await db
    .select()
    .from(schema.userProgramCycles)
    .where(
      and(
        eq(schema.userProgramCycles.userId, userId),
        eq(schema.userProgramCycles.status, 'active'),
        eq(schema.userProgramCycles.isComplete, false),
      ),
    )
    .orderBy(desc(schema.userProgramCycles.startedAt))
    .all();

  const hasActiveProgram = activeCycles.length > 0;
  const activeCycle = activeCycles[0] ?? null;

  let todayScheduledWorkout: typeof schema.programCycleWorkouts.$inferSelect | null = null;
  let nextWorkout: {
    cycleWorkoutId: string;
    name: string;
    programName: string;
    scheduledAt: Date | null;
  } | null = null;
  let isRestDay = false;

  let cycleWorkouts: (typeof schema.programCycleWorkouts.$inferSelect)[] = [];
  if (activeCycle) {
    cycleWorkouts = await db
      .select()
      .from(schema.programCycleWorkouts)
      .where(eq(schema.programCycleWorkouts.cycleId, activeCycle.id))
      .orderBy(schema.programCycleWorkouts.weekNumber, schema.programCycleWorkouts.sessionNumber)
      .all();

    const currentCycleWorkout =
      cycleWorkouts.find(
        (workout) =>
          !workout.isComplete &&
          workout.weekNumber === activeCycle.currentWeek &&
          workout.sessionNumber === activeCycle.currentSession,
      ) ??
      cycleWorkouts.find((workout) => !workout.isComplete) ??
      null;

    const incompleteScheduledToday =
      cycleWorkouts.find(
        (workout) =>
          !workout.isComplete &&
          workout.scheduledAt &&
          workout.scheduledAt >= todayStart &&
          workout.scheduledAt <= todayEnd,
      ) ?? null;

    if (
      currentCycleWorkout?.scheduledAt &&
      currentCycleWorkout.scheduledAt >= todayStart &&
      currentCycleWorkout.scheduledAt <= todayEnd
    ) {
      todayScheduledWorkout = currentCycleWorkout;
    } else if (incompleteScheduledToday) {
      todayScheduledWorkout = incompleteScheduledToday;
    } else {
      isRestDay = true;
      const upcomingWorkout =
        currentCycleWorkout && currentCycleWorkout.scheduledAt
          ? currentCycleWorkout
          : (cycleWorkouts.find(
              (workout) =>
                !workout.isComplete && workout.scheduledAt && workout.scheduledAt >= todayStart,
            ) ?? currentCycleWorkout);

      if (upcomingWorkout) {
        nextWorkout = {
          cycleWorkoutId: upcomingWorkout.id,
          name: upcomingWorkout.sessionName,
          programName: activeCycle.name,
          scheduledAt: upcomingWorkout.scheduledAt ?? null,
        };
      }
    }
  }

  let todayWorkoutOutput: {
    workout: {
      cycleWorkoutId: string;
      workoutId: string | null;
      name: string;
      focus: string;
      exercises: GroupedExercise[];
      programName: string;
      programCycleId: string;
      scheduledAt: Date | null;
      isComplete: boolean;
    } | null;
    nextWorkout: {
      cycleWorkoutId: string;
      name: string;
      programName: string;
      scheduledAt: Date | null;
    } | null;
    hasActiveProgram: boolean;
    isRestDay: boolean;
  } = {
    workout: null,
    nextWorkout: null,
    hasActiveProgram,
    isRestDay,
  };

  if (todayScheduledWorkout && activeCycle) {
    const parsedTargetLifts = parseTargetLifts(todayScheduledWorkout.targetLifts);
    const exercises = groupConsecutiveExercises(parsedTargetLifts);

    const cycleWorkout = todayScheduledWorkout;
    todayWorkoutOutput = {
      workout: {
        cycleWorkoutId: cycleWorkout.id,
        workoutId: cycleWorkout.workoutId ?? null,
        name: cycleWorkout.sessionName,
        focus: exercises.length > 0 ? exercises[0].name : '',
        exercises,
        programName: activeCycle.name,
        programCycleId: activeCycle.id,
        scheduledAt: cycleWorkout.scheduledAt ?? null,
        isComplete: cycleWorkout.isComplete ?? false,
      },
      nextWorkout: null,
      hasActiveProgram,
      isRestDay: false,
    };
  } else if (isRestDay && nextWorkout) {
    todayWorkoutOutput = {
      ...todayWorkoutOutput,
      nextWorkout,
    };
  }

  const [whoopRecovery, whoopCycles, whoopSleepRecords, whoopProfile, latestOneRMs, prefs] =
    await Promise.all([
      db
        .select()
        .from(schema.whoopRecovery)
        .where(
          and(
            eq(schema.whoopRecovery.userId, userId),
            gte(schema.whoopRecovery.date, todayStart),
            lte(schema.whoopRecovery.date, todayEnd),
          ),
        )
        .get(),
      db
        .select()
        .from(schema.whoopCycle)
        .where(
          and(
            eq(schema.whoopCycle.userId, userId),
            gte(schema.whoopCycle.start, todayStart),
            lte(schema.whoopCycle.start, todayEnd),
          ),
        )
        .all(),
      db
        .select()
        .from(schema.whoopSleep)
        .where(and(eq(schema.whoopSleep.userId, userId), lte(schema.whoopSleep.start, todayEnd)))
        .orderBy(desc(schema.whoopSleep.end))
        .limit(10)
        .all(),
      db.select().from(schema.whoopProfile).where(eq(schema.whoopProfile.userId, userId)).get(),
      getLatestOneRMsForUser(db, userId),
      db
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .get(),
    ]);

  const workoutsCompleted = cached?.weeklyWorkouts ?? 0;

  let workoutsTarget = 3;
  if (activeCycle && cycleWorkouts.length > 0) {
    workoutsTarget = cycleWorkouts.filter(
      (workout) =>
        workout.scheduledAt &&
        workout.scheduledAt >= weekStartUtc &&
        workout.scheduledAt <= weekEndUtcEnd,
    ).length;
  }

  const totalVolume = cached?.weeklyVolume ?? 0;

  const weightUnit = prefs?.weightUnit ?? 'kg';
  const displayVolume = weightUnit === 'lbs' ? totalVolume * 2.20462 : totalVolume;
  const totalVolumeLabel =
    displayVolume > 1000
      ? `${Math.round(displayVolume / 1000)}k ${weightUnit}`
      : `${Math.round(displayVolume)} ${weightUnit}`;

  const lookbackStartLocal = addDaysToLocalDate(localDate, -365);
  const { start: streakRangeStart } = getUtcRangeForLocalDate(lookbackStartLocal, timezone);
  const { end: streakRangeEnd } = getUtcRangeForLocalDate(localDate, timezone);

  const recentWorkoutDates = await db
    .select({ completedAt: schema.workouts.completedAt })
    .from(schema.workouts)
    .where(
      and(
        eq(schema.workouts.userId, userId),
        eq(schema.workouts.isDeleted, false),
        isNotNull(schema.workouts.completedAt),
        gte(schema.workouts.completedAt, streakRangeStart),
        lte(schema.workouts.completedAt, streakRangeEnd),
      ),
    )
    .limit(500)
    .all();

  const workoutDates = new Set(
    recentWorkoutDates
      .map((w) => (w.completedAt ? formatLocalDate(new Date(w.completedAt), timezone) : null))
      .filter((d): d is string => d !== null),
  );
  const streakDays = computeStreak(localDate, workoutDates);

  const weeklyStats = {
    workoutsCompleted,
    workoutsTarget,
    streakDays,
    totalVolume,
    totalVolumeLabel,
  };

  const isWhoopConnected = !!whoopProfile;
  const strain = whoopCycles.length > 0 ? (whoopCycles[0].dayStrain ?? null) : null;

  const mostRecentSleep =
    whoopSleepRecords.find((s) => {
      const sleepEnd = new Date(s.end);
      const rangeStart = new Date(todayStart);
      const rangeEnd = new Date(todayEnd);
      return sleepEnd >= rangeStart && sleepEnd <= rangeEnd;
    }) ?? null;

  const recoverySnapshot = {
    sleepDurationLabel: mostRecentSleep
      ? formatSleepDuration(mostRecentSleep.totalSleepTimeMilli)
      : null,
    sleepPerformancePercentage: mostRecentSleep?.sleepPerformancePercentage ?? null,
    recoveryScore: whoopRecovery?.recoveryScore ?? null,
    recoveryStatus: getRecoveryStatusTone(whoopRecovery?.recoveryScore ?? null),
    strain,
    isWhoopConnected,
  };

  const oneRepMaxes = {
    squat: activeCycle?.squat1rm ?? latestOneRMs?.squat1rm ?? null,
    bench: activeCycle?.bench1rm ?? latestOneRMs?.bench1rm ?? null,
    deadlift: activeCycle?.deadlift1rm ?? latestOneRMs?.deadlift1rm ?? null,
    ohp: activeCycle?.ohp1rm ?? latestOneRMs?.ohp1rm ?? null,
  };

  return c.json({
    date: dateInfo,
    todayWorkout: todayWorkoutOutput,
    weeklyStats,
    oneRepMaxes,
    recoverySnapshot,
  });
}
