import { eq, and, gte, lte, desc, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { formatLocalDate } from '@strength/db';
import * as schema from '@strength/db';
import { requireAuth } from '../auth';
import { resolveUserTimezone, getDateRangeForTimezone } from '../../lib/timezone';

function getDb(c: any) {
  return drizzle(c.env.DB, { schema });
}

function parseTargetLifts(targetLifts: string | null | undefined): Array<{ name: string }> {
  if (!targetLifts) return [];
  if (Array.isArray(targetLifts)) return targetLifts;
  try {
    const parsed = JSON.parse(targetLifts);
    return Array.isArray(parsed) ? parsed : [];
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

type RecoveryStatus = 'green' | 'yellow' | 'red' | null;

function getRecoveryStatusTone(recoveryScore: number | null): RecoveryStatus {
  if (recoveryScore === null) return null;
  if (recoveryScore >= 67) return 'green';
  if (recoveryScore >= 40) return 'yellow';
  return 'red';
}

export async function homeSummaryHandler(c: any) {
  try {
    const session = await requireAuth(c);
    if (!session?.user) {
      return c.json({ message: 'Unauthorized' }, 401);
    }
    const userId = session.user.id;
    const db = getDb(c);

    const timezoneResult = await resolveUserTimezone(db, userId, c.req.query('timezone'));
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
      .all();

    const hasActiveProgram = activeCycles.length > 0;
    const activeCycle = activeCycles[0] ?? null;

    let todayScheduledWorkout: typeof schema.programCycleWorkouts.$inferSelect | null = null;
    let nextWorkout: {
      cycleWorkoutId: string;
      name: string;
      scheduledDate: string;
      scheduledTime: string | null;
      scheduledTimezone: string;
    } | null = null;
    let isRestDay = false;

    if (activeCycle) {
      const scheduledToday = await db
        .select()
        .from(schema.programCycleWorkouts)
        .where(
          and(
            eq(schema.programCycleWorkouts.cycleId, activeCycle.id),
            eq(schema.programCycleWorkouts.scheduledDate, localDate),
          ),
        )
        .get();

      if (scheduledToday) {
        todayScheduledWorkout = scheduledToday;
      } else {
        isRestDay = true;
        const upcomingWorkouts = await db
          .select({
            id: schema.programCycleWorkouts.id,
            sessionName: schema.programCycleWorkouts.sessionName,
            scheduledDate: schema.programCycleWorkouts.scheduledDate,
            scheduledTime: schema.programCycleWorkouts.scheduledTime,
            scheduledTimezone: schema.programCycleWorkouts.scheduledTimezone,
          })
          .from(schema.programCycleWorkouts)
          .where(
            and(
              eq(schema.programCycleWorkouts.cycleId, activeCycle.id),
              gte(schema.programCycleWorkouts.scheduledDate, localDate),
            ),
          )
          .orderBy(schema.programCycleWorkouts.scheduledDate)
          .limit(1)
          .get();

        if (upcomingWorkouts) {
          nextWorkout = {
            cycleWorkoutId: upcomingWorkouts.id,
            name: upcomingWorkouts.sessionName,
            scheduledDate: upcomingWorkouts.scheduledDate ?? '',
            scheduledTime: upcomingWorkouts.scheduledTime,
            scheduledTimezone: upcomingWorkouts.scheduledTimezone ?? timezone,
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
        exercises: string[];
        programName: string;
        programCycleId: string;
        scheduledDate: string;
        scheduledTime: string | null;
        scheduledTimezone: string;
        isComplete: boolean;
      } | null;
      nextWorkout: {
        cycleWorkoutId: string;
        name: string;
        scheduledDate: string;
        scheduledTime: string | null;
        scheduledTimezone: string;
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
      const exercises = parsedTargetLifts.map((t: any) => t.name).filter(Boolean);

      const cycleWorkout = todayScheduledWorkout;
      todayWorkoutOutput = {
        workout: {
          cycleWorkoutId: cycleWorkout.id,
          workoutId: cycleWorkout.workoutId ?? null,
          name: cycleWorkout.sessionName,
          focus: exercises.length > 0 ? exercises[0] : '',
          exercises,
          programName: activeCycle.name,
          programCycleId: activeCycle.id,
          scheduledDate: cycleWorkout.scheduledDate ?? localDate,
          scheduledTime: cycleWorkout.scheduledTime ?? null,
          scheduledTimezone: cycleWorkout.scheduledTimezone ?? timezone,
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

    const weekCompletedWorkouts = await db
      .select({
        id: schema.workouts.id,
        completedLocalDate: schema.workouts.completedLocalDate,
        totalVolume: schema.workouts.totalVolume,
      })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.userId, userId),
          eq(schema.workouts.isDeleted, false),
          isNotNull(schema.workouts.completedAt),
          gte(schema.workouts.completedLocalDate, weekStart),
          lte(schema.workouts.completedLocalDate, weekEnd),
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
            gte(schema.programCycleWorkouts.scheduledDate, weekStart),
            lte(schema.programCycleWorkouts.scheduledDate, weekEnd),
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
      const todayStr = localDate;
      let checkDate = todayStr;
      while (true) {
        const dayWorkouts = await db
          .select({ id: schema.workouts.id })
          .from(schema.workouts)
          .where(
            and(
              eq(schema.workouts.userId, userId),
              eq(schema.workouts.isDeleted, false),
              isNotNull(schema.workouts.completedAt),
              eq(schema.workouts.completedLocalDate, checkDate),
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

    const { start: dayStart, end: dayEnd } = getDateRangeForTimezone(localDate, timezone);

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
