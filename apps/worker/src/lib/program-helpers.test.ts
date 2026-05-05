import { describe, expect, test, vi } from 'vitest';
import {
  normalizeProgramSetCount,
  normalizeProgramReps,
  isProgramAmrap,
  normalizeProgramTargetLift,
  parseProgramTargetLifts,
  consolidateProgramTargetLifts,
  getOneRMsFromCompletedTestSetRows,
  getCurrentCycleWorkout,
  createOneRMTestWorkout,
  createWorkoutFromProgramCycleWorkout,
  advanceProgramCycleForWorkout,
} from './program-helpers';

vi.mock('@strength/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@strength/db')>();
  return {
    ...actual,
    getProgramCycleById: vi.fn(async (_db: any, cycleId: string, _userId: string) => {
      if (cycleId === 'cycle-1') {
        return {
          id: 'cycle-1',
          userId: 'user-1',
          name: 'Test Cycle',
          programSlug: 'test',
          squat1rm: 100,
          bench1rm: 80,
          deadlift1rm: 120,
          ohp1rm: 50,
          totalSessionsPlanned: 12,
        };
      }
      return null;
    }),
    getOrCreateExerciseForUser: vi.fn(async (_db: any, _userId: string, name: string) => {
      return `ex-${name.toLowerCase().replace(/\s+/g, '-')}`;
    }),
  };
});

describe('normalizeProgramSetCount', () => {
  test('returns valid numbers unchanged', () => {
    expect(normalizeProgramSetCount(5)).toBe(5);
    expect(normalizeProgramSetCount(1)).toBe(1);
  });

  test('returns fallback for invalid values', () => {
    expect(normalizeProgramSetCount(0)).toBe(1);
    expect(normalizeProgramSetCount(-1)).toBe(1);
    expect(normalizeProgramSetCount('five')).toBe(1);
    expect(normalizeProgramSetCount(null)).toBe(1);
  });

  test('uses custom fallback', () => {
    expect(normalizeProgramSetCount(null, 3)).toBe(3);
  });
});

describe('normalizeProgramReps', () => {
  test('returns valid numbers', () => {
    expect(normalizeProgramReps(5)).toBe(5);
    expect(normalizeProgramReps('8')).toBe(8);
  });

  test('returns null for invalid values', () => {
    expect(normalizeProgramReps(-1)).toBeNull();
    expect(normalizeProgramReps('abc')).toBeNull();
    expect(normalizeProgramReps(null)).toBeNull();
  });
});

describe('isProgramAmrap', () => {
  test('detects explicit isAmrap flag', () => {
    expect(isProgramAmrap({ isAmrap: true })).toBe(true);
    expect(isProgramAmrap({ isAmrap: false })).toBe(false);
  });

  test('detects AMRAP string', () => {
    expect(isProgramAmrap({ reps: 'AMRAP' })).toBe(true);
    expect(isProgramAmrap({ reps: 'amrap' })).toBe(true);
  });

  test('detects plus sign in name', () => {
    expect(isProgramAmrap({ name: 'Squat 5+' })).toBe(true);
    expect(isProgramAmrap({ name: 'Squat 5' })).toBe(false);
  });
});

describe('normalizeProgramTargetLift', () => {
  test('returns null for empty name', () => {
    expect(normalizeProgramTargetLift({ name: '' })).toBeNull();
    expect(normalizeProgramTargetLift({ name: '  ' })).toBeNull();
  });

  test('normalizes required fields', () => {
    const result = normalizeProgramTargetLift({ name: 'Squat' });
    expect(result).toEqual({
      name: 'Squat',
      targetWeight: null,
      addedWeight: 0,
      sets: 1,
      reps: null,
      isAccessory: false,
      isRequired: true,
      isAmrap: false,
    });
  });

  test('preserves optional fields', () => {
    const result = normalizeProgramTargetLift({
      name: 'Bench',
      lift: 'bench',
      targetWeight: 100,
      addedWeight: 10,
      sets: 3,
      reps: 5,
      isAccessory: true,
      isRequired: false,
      isAmrap: true,
      libraryId: 'lib-1',
      exerciseId: 'ex-1',
    });
    expect(result).toEqual({
      name: 'Bench',
      lift: 'bench',
      targetWeight: 100,
      addedWeight: 10,
      sets: 3,
      reps: 5,
      isAccessory: true,
      isRequired: false,
      isAmrap: true,
      libraryId: 'lib-1',
      exerciseId: 'ex-1',
    });
  });
});

describe('parseProgramTargetLifts', () => {
  test('returns empty arrays for null input', () => {
    const result = parseProgramTargetLifts(null);
    expect(result.exercises).toEqual([]);
    expect(result.accessories).toEqual([]);
    expect(result.all).toEqual([]);
  });

  test('parses flat array', () => {
    const result = parseProgramTargetLifts(
      JSON.stringify([
        { name: 'Squat', isAccessory: false },
        { name: 'Curls', isAccessory: true },
      ]),
    );
    expect(result.exercises).toHaveLength(1);
    expect(result.accessories).toHaveLength(1);
    expect(result.all).toHaveLength(2);
  });

  test('parses object shape', () => {
    const result = parseProgramTargetLifts(
      JSON.stringify({
        exercises: [{ name: 'Squat' }],
        accessories: [{ name: 'Curls' }],
      }),
    );
    expect(result.exercises).toHaveLength(1);
    expect(result.accessories).toHaveLength(1);
  });

  test('handles invalid JSON', () => {
    const result = parseProgramTargetLifts('not json');
    expect(result.all).toEqual([]);
  });
});

describe('consolidateProgramTargetLifts', () => {
  test('combines repeated program blocks into one exercise target', () => {
    const parsed = parseProgramTargetLifts(
      JSON.stringify({
        exercises: [
          { name: 'Squat', lift: 'squat', sets: 3, reps: 5, targetWeight: 100 },
          { name: 'Squat', lift: 'squat', sets: 1, reps: 3, targetWeight: 110 },
          { name: 'Bench Press', lift: 'bench', sets: 2, reps: 5, targetWeight: 80 },
        ],
      }),
    );

    const consolidated = consolidateProgramTargetLifts(parsed.all);

    expect(consolidated).toHaveLength(2);
    expect(consolidated[0].name).toBe('Squat');
    expect(consolidated[0].sets).toBe(4);
    expect(consolidated[0].segments).toHaveLength(2);
    expect(consolidated[1].name).toBe('Bench Press');
  });

  test('groups exercises by libraryId even when exerciseId differs', () => {
    const parsed = parseProgramTargetLifts(
      JSON.stringify({
        exercises: [
          {
            name: 'Squat',
            lift: 'squat',
            libraryId: 'barbell-squat',
            exerciseId: 'ex-a',
            sets: 3,
            reps: 5,
            targetWeight: 100,
          },
          {
            name: 'Squat 2',
            lift: 'squat',
            libraryId: 'barbell-squat',
            exerciseId: 'ex-b',
            sets: 1,
            reps: 5,
            targetWeight: 120,
          },
          {
            name: 'Squat 3+',
            lift: 'squat',
            libraryId: 'barbell-squat',
            exerciseId: 'ex-c',
            sets: 1,
            reps: 5,
            targetWeight: 140,
            isAmrap: true,
          },
        ],
      }),
    );

    const consolidated = consolidateProgramTargetLifts(parsed.all);

    expect(consolidated).toHaveLength(1);
    expect(consolidated[0].name).toBe('Squat');
    expect(consolidated[0].sets).toBe(5);
    expect(consolidated[0].isAmrap).toBe(true);
    expect(consolidated[0].segments).toHaveLength(3);
  });

  test('groups accessories by accessoryId regardless of libraryId presence', () => {
    const parsed = parseProgramTargetLifts(
      JSON.stringify({
        exercises: [
          {
            name: 'Bench Press',
            lift: 'bench',
            libraryId: 'barbell-bench-press',
            sets: 3,
            reps: 5,
            targetWeight: 80,
          },
        ],
        accessories: [
          {
            name: 'Dips',
            accessoryId: 'dips',
            isAccessory: true,
            sets: 3,
            reps: '50-100 reps total',
          },
          { name: 'Dips', accessoryId: 'dips', isAccessory: true, sets: 2, reps: 15 },
        ],
      }),
    );

    const consolidated = consolidateProgramTargetLifts(parsed.all);

    expect(consolidated).toHaveLength(2);
    expect(consolidated[0].name).toBe('Bench Press');
    expect(consolidated[1].name).toBe('Dips');
    expect(consolidated[1].sets).toBe(5);
    expect(consolidated[1].segments).toHaveLength(2);
  });
});

describe('getOneRMsFromCompletedTestSetRows', () => {
  test('derives max 1RM values from completed 1RM workout set history', () => {
    const result = getOneRMsFromCompletedTestSetRows([
      { exerciseName: 'Squat', weight: 120 },
      { exerciseName: 'Squat', weight: 125 },
      { exerciseName: 'Bench Press', weight: 90 },
      { exerciseName: 'Deadlift', weight: 160 },
      { exerciseName: 'Overhead Press', weight: 60 },
      { exerciseName: 'Curls', weight: 30 },
      { exerciseName: 'Deadlift', weight: null },
    ]);

    expect(result).toEqual({
      squat1rm: 125,
      bench1rm: 90,
      deadlift1rm: 160,
      ohp1rm: 60,
    });
  });
});

describe('getCurrentCycleWorkout', () => {
  const workouts = [
    { id: 'w1', weekNumber: 1, sessionNumber: 1 },
    { id: 'w2', weekNumber: 1, sessionNumber: 2 },
    { id: 'w3', weekNumber: 2, sessionNumber: 1 },
  ];

  test('returns matching week/session', () => {
    const result = getCurrentCycleWorkout({ currentWeek: 1, currentSession: 2 }, workouts);
    expect(result?.id).toBe('w2');
  });

  test('falls back to first incomplete', () => {
    const result = getCurrentCycleWorkout({ currentWeek: 3, currentSession: 1 }, workouts);
    expect(result?.id).toBe('w1');
  });

  test('returns null for empty array', () => {
    const result = getCurrentCycleWorkout({ currentWeek: 1, currentSession: 1 }, []);
    expect(result).toBeNull();
  });
});

function createMockDb() {
  const insertedWorkouts: any[] = [];
  const insertedExercises: any[] = [];
  const insertedSets: any[] = [];
  const updatedCycleWorkouts: any[] = [];

  const builder: any = {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    innerJoin: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    get: async () => undefined,
    all: async () => [],
    batch: async (statements: any[]) => {
      return statements.map(() => ({ success: true }));
    },
    insert: (table: any) => ({
      values: (vals: any) => {
        const tableName = table[Symbol.for('drizzle:Name')];
        if (tableName === 'workouts') {
          const row = Array.isArray(vals) ? vals : [vals];
          insertedWorkouts.push(...row);
        } else if (tableName === 'workout_exercises') {
          const rows = Array.isArray(vals) ? vals : [vals];
          insertedExercises.push(...rows);
        } else if (tableName === 'workout_sets') {
          const rows = Array.isArray(vals) ? vals : [vals];
          insertedSets.push(...rows);
        }
        return {
          returning: () => ({ get: async () => ({ id: 'test-id' }) }),
          run: async () => ({ success: true }),
          onConflictDoUpdate: () => ({
            returning: () => ({ get: async () => ({ id: 'test-id' }) }),
            run: async () => ({ success: true }),
          }),
          prepare: () => ({ getQuery: () => ({ sql: '', params: [] }) }),
        };
      },
    }),
    update: (_table: any) => ({
      set: (vals: any) => ({
        where: () => ({
          run: async () => {
            updatedCycleWorkouts.push(vals);
            return { success: true };
          },
          returning: () => ({
            get: async () => {
              updatedCycleWorkouts.push(vals);
              return { ...vals, id: 'test-cycle-id' };
            },
          }),
        }),
      }),
    }),
    _insertedWorkouts: insertedWorkouts,
    _insertedExercises: insertedExercises,
    _insertedSets: insertedSets,
    _updatedCycleWorkouts: updatedCycleWorkouts,
  };
  return builder;
}

describe('createOneRMTestWorkout', () => {
  test('returns existing workout if incomplete 1RM test exists', async () => {
    const existing = { id: 'existing', completedAt: null };
    const db = createMockDb();
    db.select = () => db;
    db.from = () => db;
    db.where = () => db;
    db.orderBy = () => db;
    db.limit = () => db;
    db.get = async () => existing;

    const result = await createOneRMTestWorkout(db, 'user-1', 'cycle-1');
    expect(result).toEqual(existing);
  });

  test('creates batched 1RM workout when none exists', async () => {
    const db = createMockDb();
    const result = await createOneRMTestWorkout(db, 'user-1', 'cycle-1');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('1RM Test');
    expect(db._insertedWorkouts).toHaveLength(1);
  });
});

describe('createWorkoutFromProgramCycleWorkout', () => {
  test('throws when no target lifts', async () => {
    const db = createMockDb();
    await expect(
      createWorkoutFromProgramCycleWorkout(db, 'user-1', 'cycle-1', {
        id: 'cw-1',
        targetLifts: null,
        sessionName: 'Test Session',
      }),
    ).rejects.toThrow('has no target lifts');
  });

  test('batches inserts transactionally', async () => {
    const db = createMockDb();
    let batchCalled = false;
    db.batch = async (statements: any[]) => {
      batchCalled = true;
      expect(statements.length).toBeGreaterThanOrEqual(3);
      return statements.map(() => ({ success: true }));
    };

    const result = await createWorkoutFromProgramCycleWorkout(db, 'user-1', 'cycle-1', {
      id: 'cw-1',
      targetLifts: JSON.stringify([{ name: 'Squat', sets: 3, reps: 5, targetWeight: 100 }]),
      sessionName: 'Session A',
    });

    expect(batchCalled).toBe(true);
    expect(result.name).toBe('Session A');
    expect(result.programCycleId).toBe('cycle-1');
  });

  test('creates one workout exercise with all sets for repeated program lift blocks', async () => {
    const db = createMockDb();

    await createWorkoutFromProgramCycleWorkout(db, 'user-1', 'cycle-1', {
      id: 'cw-1',
      targetLifts: JSON.stringify({
        exercises: [
          { name: 'Squat', lift: 'squat', sets: 3, reps: 5, targetWeight: 100 },
          { name: 'Squat', lift: 'squat', sets: 1, reps: 3, targetWeight: 110 },
          { name: 'Squat', lift: 'squat', sets: 1, reps: 1, targetWeight: 120, isAmrap: true },
        ],
      }),
      sessionName: 'Session A',
    });

    expect(db._insertedExercises).toHaveLength(1);
    expect(db._insertedSets).toHaveLength(5);
    expect(db._insertedSets.map((set: any) => set.setNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(db._insertedSets.map((set: any) => set.weight)).toEqual([100, 100, 100, 110, 120]);
    expect(db._insertedSets.map((set: any) => set.reps)).toEqual([5, 5, 5, 3, null]);
  });
});

describe('advanceProgramCycleForWorkout', () => {
  test('marks parent cycle complete for a completed 1RM test workout', async () => {
    const db = createMockDb();
    db.get = async () => ({
      id: 'workout-1',
      name: '1RM Test',
      programCycleId: 'cycle-1',
      isDeleted: false,
    });

    await advanceProgramCycleForWorkout(db, 'user-1', 'workout-1');

    expect(db._updatedCycleWorkouts).toHaveLength(1);
    expect(db._updatedCycleWorkouts[0]).toMatchObject({
      status: 'completed',
      isComplete: true,
    });
    expect(db._updatedCycleWorkouts[0].completedAt).toBeInstanceOf(Date);
  });
});
