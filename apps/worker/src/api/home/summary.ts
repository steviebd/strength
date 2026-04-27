import { eq, and, gte, lte, desc, isNotNull } from 'drizzle-orm';
import { formatLocalDate } from '@strength/db';
import * as schema from '@strength/db';
import { requireAuthContext } from '../auth';
import { resolveUserTimezone, getUtcRangeForLocalDate } from '../../lib/timezone';

function parseTargetLifts(targetLifts: string | null | undefined): Array<{ name: string }> {
  if (!targetLifts) return [];
  if (Array.isArray(targetLifts)) return targetLifts;
  try {
    const parsed = JSON.parse(targetLifts);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as {
        exercises?: Array<{ name?: string }>;
        accessories?: Array<{ name?: string }>;
      };
      return [...(record.exercises ?? []), ...(record.accessories ?? [])]
        .filter((lift) => typeof lift?.name === 'string' && lift.name.length > 0)
        .map((lift) => ({ name: lift.name as string }));
    }
    return [];
  } catch {
    return [];
  }
}

function getMondayOfWeek(date: Date, timezone: string): string {
  const localDateStr = formatLocalDate(date, timezone);
  const { year, month, day } = parseLocalDate(localDateStr);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diff);
  return formatDateParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function parseLocalDate(localDate: string): { year: number; month: number; day: number } {
  const parts = localDate.split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
  };
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(localDate: string, days: number): string {
  const { year, month, day } = parseLocalDate(localDate);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function getWeekRange(localDate: string, timezone: string): { weekStart: string; weekEnd: string } {
  const mondayStr = getMondayOfWeek(new Date(localDate), timezone);
  const sundayStr = addDays(mondayStr, 6);
  return { weekStart: mondayStr, weekEnd: sundayStr };
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

type GroupedExercise = { name: string; count: number };

function groupConsecutiveExercises(names: string[]): GroupedExercise[] {
  const grouped: GroupedExercise[] = [];
  for (const name of names) {
    if (grouped.length > 0 && grouped[grouped.length - 1].name === name) {
      grouped[grouped.length - 1].count++;
    } else {
      grouped.push({ name, count: 1 });
    }
  }
  return grouped;
}

type RecoveryStatus = 'green' | 'yellow' | 'red' | null;

function getRecoveryStatusTone(recoveryScore: number | null): RecoveryStatus {
  if (recoveryScore === null) return null;
  if (recoveryScore >= 67) return 'green';
  if (recoveryScore >= 40) return 'yellow';
  return 'red';
}

export async function homeSummaryHandler(c: any) {
  try {
    const auth = await requireAuthContext(c);
    if (auth instanceof Response) return auth;
    const { userId, db } = auth;

    console.log('[HOME DEBUG] userId:', userId);
    const timezoneResult = await resolveUserTimezone(db, userId);
    console.log('[HOME DEBUG] timezoneResult:', timezoneResult);
    if (timezoneResult.error || !timezoneResult.timezone) {
      return c.json({ error: timezoneResult.error }, 400);
    }

    const timezone = timezoneResult.timezone;
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

    const { start: todayStart, end: todayEnd } = getUtcRangeForLocalDate(localDate, timezone);

    if (activeCycle) {
      const cycleWorkouts = await db
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
      const exerciseNames = parsedTargetLifts.map((t: any) => t.name).filter(Boolean);
      const exercises = groupConsecutiveExercises(exerciseNames);

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

    const { weekStart, weekEnd } = getWeekRange(localDate, timezone);
    const { start: weekStartUtc } = getUtcRangeForLocalDate(weekStart, timezone);
    const { end: weekEndUtcEnd } = getUtcRangeForLocalDate(weekEnd, timezone);

    const weekCompletedWorkouts = await db
      .select({
        id: schema.workouts.id,
        completedAt: schema.workouts.completedAt,
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
      .all();

    const workoutsCompleted = weekCompletedWorkouts.length;

    let workoutsTarget = 3;
    if (activeCycle) {
      const scheduledInWeek = await db
        .select({ id: schema.programCycleWorkouts.id })
        .from(schema.programCycleWorkouts)
        .where(
          and(
            eq(schema.programCycleWorkouts.cycleId, activeCycle.id),
            isNotNull(schema.programCycleWorkouts.scheduledAt),
            gte(schema.programCycleWorkouts.scheduledAt, weekStartUtc),
            lte(schema.programCycleWorkouts.scheduledAt, weekEndUtcEnd),
          ),
        )
        .all();
      workoutsTarget = scheduledInWeek.length;
    }

    const totalVolume = weekCompletedWorkouts.reduce((sum, w) => sum + (w.totalVolume ?? 0), 0);

    const totalVolumeLabel =
      totalVolume > 1000
        ? `${Math.round(totalVolume / 1000)}k kg`
        : `${Math.round(totalVolume)} kg`;

    let streakDays = 0;
    if (hasActiveProgram) {
      let checkDate = localDate;
      while (true) {
        const { start: dayStart, end: dayEnd } = getUtcRangeForLocalDate(checkDate, timezone);
        const dayWorkouts = await db
          .select({ id: schema.workouts.id })
          .from(schema.workouts)
          .where(
            and(
              eq(schema.workouts.userId, userId),
              eq(schema.workouts.isDeleted, false),
              isNotNull(schema.workouts.completedAt),
              gte(schema.workouts.completedAt, dayStart),
              lte(schema.workouts.completedAt, dayEnd),
            ),
          )
          .limit(1)
          .get();

        if (dayWorkouts) {
          streakDays++;
          const prevDate = addDays(checkDate, -1);
          checkDate = prevDate;
        } else {
          break;
        }
      }
    }

    const weeklyStats = {
      workoutsCompleted,
      workoutsTarget,
      streakDays,
      totalVolume,
      totalVolumeLabel,
    };

    const { start: dayStart, end: dayEnd } = getUtcRangeForLocalDate(localDate, timezone);

    const recovery = await db
      .select()
      .from(schema.whoopRecovery)
      .where(
        and(
          eq(schema.whoopRecovery.userId, userId),
          gte(schema.whoopRecovery.date, dayStart),
          lte(schema.whoopRecovery.date, dayEnd),
        ),
      )
      .get();

    const cycles = await db
      .select()
      .from(schema.whoopCycle)
      .where(
        and(
          eq(schema.whoopCycle.userId, userId),
          gte(schema.whoopCycle.start, dayStart),
          lte(schema.whoopCycle.start, dayEnd),
        ),
      )
      .all();

    const sleepRecords = await db
      .select()
      .from(schema.whoopSleep)
      .where(and(eq(schema.whoopSleep.userId, userId), lte(schema.whoopSleep.start, dayEnd)))
      .orderBy(desc(schema.whoopSleep.end))
      .limit(10)
      .all();

    const mostRecentSleep =
      sleepRecords.find((s) => {
        const sleepEnd = new Date(s.end);
        const rangeStart = new Date(dayStart);
        const rangeEnd = new Date(dayEnd);
        return sleepEnd >= rangeStart && sleepEnd <= rangeEnd;
      }) ?? null;

    const whoopProfile = await db
      .select()
      .from(schema.whoopProfile)
      .where(eq(schema.whoopProfile.userId, userId))
      .get();

    const isWhoopConnected = !!whoopProfile;

    const strain = cycles.length > 0 ? (cycles[0].dayStrain ?? null) : null;

    const recoverySnapshot = {
      sleepDurationLabel: mostRecentSleep
        ? formatSleepDuration(mostRecentSleep.totalSleepTimeMilli)
        : null,
      sleepPerformancePercentage: mostRecentSleep?.sleepPerformancePercentage ?? null,
      recoveryScore: recovery?.recoveryScore ?? null,
      recoveryStatus: getRecoveryStatusTone(recovery?.recoveryScore ?? null),
      strain,
      isWhoopConnected,
    };

    return c.json({
      date: dateInfo,
      todayWorkout: todayWorkoutOutput,
      weeklyStats,
      recoverySnapshot,
    });
  } catch (e) {
    console.error(e);
    throw e;
  }
}
