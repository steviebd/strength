import { eq, and, desc } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { userProgramCycles, programCycleWorkouts, generateId } from '../schema';
import { chunkedInsert } from '../utils/d1-batch';
import type { CreateProgramCycleData } from './types';

export type { CreateProgramCycleData };

export interface UserProgramCycleRow {
  id: string;
  userId: string;
  programSlug: string;
  name: string;
  squat1rm: number;
  bench1rm: number;
  deadlift1rm: number;
  ohp1rm: number;
  startingSquat1rm?: number;
  startingBench1rm?: number;
  startingDeadlift1rm?: number;
  startingOhp1rm?: number;
  currentWeek: number;
  currentSession: number;
  totalSessionsCompleted: number;
  totalSessionsPlanned: number;
  estimatedWeeks?: number;
  status: string;
  isComplete: boolean;
  startedAt: Date | null;
  completedAt?: Date | null;
  updatedAt?: Date | null;
  preferredGymDays?: string | null;
  preferredTimeOfDay?: string | null;
  programStartDate?: string | null;
  firstSessionDate?: string | null;
}

export interface ProgramCycleWorkoutRow {
  id: string;
  cycleId: string;
  templateId?: string | null;
  weekNumber: number;
  sessionNumber: number;
  sessionName: string;
  targetLifts?: string | null;
  isComplete: boolean;
  workoutId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  scheduledTimezone?: string | null;
}

export interface ProgramCycleWithWorkouts {
  cycle: UserProgramCycleRow;
  workouts: ProgramCycleWorkoutRow[];
}

export async function createProgramCycle(
  db: DrizzleD1Database<Record<string, unknown>>,
  userId: string,
  data: CreateProgramCycleData,
): Promise<UserProgramCycleRow> {
  const firstWorkout = data.workouts?.[0];
  const cycle = await db
    .insert(userProgramCycles)
    .values({
      userId,
      programSlug: data.programSlug,
      name: data.name,
      squat1rm: data.squat1rm,
      bench1rm: data.bench1rm,
      deadlift1rm: data.deadlift1rm,
      ohp1rm: data.ohp1rm,
      startingSquat1rm: data.squat1rm,
      startingBench1rm: data.bench1rm,
      startingDeadlift1rm: data.deadlift1rm,
      startingOhp1rm: data.ohp1rm,
      totalSessionsPlanned: data.totalSessionsPlanned,
      estimatedWeeks: data.estimatedWeeks,
      preferredGymDays: data.preferredGymDays ? JSON.stringify(data.preferredGymDays) : null,
      preferredTimeOfDay: data.preferredTimeOfDay ?? null,
      programStartDate: data.programStartDate ?? null,
      firstSessionDate: data.firstSessionDate ?? null,
      currentWeek: firstWorkout?.weekNumber ?? 1,
      currentSession: firstWorkout?.sessionNumber ?? 1,
      totalSessionsCompleted: 0,
      status: 'active',
    })
    .returning()
    .get();

  if (data.workouts && data.workouts.length > 0) {
    const workoutRows = data.workouts.map((w) => ({
      id: generateId(),
      cycleId: cycle.id,
      templateId: null,
      weekNumber: w.weekNumber,
      sessionNumber: w.sessionNumber,
      sessionName: w.sessionName,
      targetLifts: w.targetLifts ?? null,
      isComplete: false,
      workoutId: null,
      scheduledDate: w.scheduledDate ?? null,
      scheduledTime: w.scheduledTime ?? null,
      scheduledTimezone: w.scheduledTimezone ?? null,
    }));

    await chunkedInsert(db, {
      table: programCycleWorkouts,
      rows: workoutRows,
    });
  }

  return cycle as UserProgramCycleRow;
}

export async function getProgramCycleWithWorkouts(
  db: DrizzleD1Database<Record<string, unknown>>,
  cycleId: string,
  userId: string,
): Promise<ProgramCycleWithWorkouts | null> {
  const cycle = await db
    .select()
    .from(userProgramCycles)
    .where(and(eq(userProgramCycles.id, cycleId), eq(userProgramCycles.userId, userId)))
    .get();

  if (!cycle) {
    return null;
  }

  const workouts = await db
    .select()
    .from(programCycleWorkouts)
    .where(eq(programCycleWorkouts.cycleId, cycleId))
    .orderBy(programCycleWorkouts.weekNumber, programCycleWorkouts.sessionNumber)
    .all();

  return {
    cycle: cycle as UserProgramCycleRow,
    workouts: workouts as ProgramCycleWorkoutRow[],
  };
}

export async function getProgramCycleById(
  db: DrizzleD1Database<Record<string, unknown>>,
  cycleId: string,
  userId: string,
): Promise<UserProgramCycleRow | null> {
  const cycle = await db
    .select()
    .from(userProgramCycles)
    .where(and(eq(userProgramCycles.id, cycleId), eq(userProgramCycles.userId, userId)))
    .get();

  return cycle as UserProgramCycleRow | null;
}

export async function getActiveProgramCycles(
  db: DrizzleD1Database<Record<string, unknown>>,
  userId: string,
  limit = 3,
): Promise<UserProgramCycleRow[]> {
  const cycles = await db
    .select()
    .from(userProgramCycles)
    .where(and(eq(userProgramCycles.userId, userId), eq(userProgramCycles.status, 'active')))
    .orderBy(desc(userProgramCycles.startedAt))
    .limit(limit)
    .all();

  return cycles as UserProgramCycleRow[];
}

export async function getProgramCyclesByUserId(
  db: DrizzleD1Database<Record<string, unknown>>,
  userId: string,
  options?: { status?: string },
): Promise<UserProgramCycleRow[]> {
  let cycles;

  if (options?.status) {
    cycles = await db
      .select()
      .from(userProgramCycles)
      .where(
        and(eq(userProgramCycles.userId, userId), eq(userProgramCycles.status, options.status)),
      )
      .orderBy(desc(userProgramCycles.startedAt))
      .all();
  } else {
    cycles = await db
      .select()
      .from(userProgramCycles)
      .where(eq(userProgramCycles.userId, userId))
      .orderBy(desc(userProgramCycles.startedAt))
      .all();
  }

  return cycles as UserProgramCycleRow[];
}

export async function softDeleteProgramCycle(
  db: DrizzleD1Database<Record<string, unknown>>,
  cycleId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(userProgramCycles)
    .set({
      status: 'deleted',
    })
    .where(and(eq(userProgramCycles.id, cycleId), eq(userProgramCycles.userId, userId)))
    .run();

  return result.success;
}
