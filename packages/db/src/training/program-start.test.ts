import { describe, expect, test } from 'vitest';
import { createProgramStartPlan } from './program-start';

describe('createProgramStartPlan', () => {
  test('creates a full local-first cycle and workout plan', () => {
    const plan = createProgramStartPlan({
      id: 'cycle-1',
      programSlug: 'stronglifts-5x5',
      name: 'StrongLifts 5x5',
      squat1rm: 100,
      bench1rm: 80,
      deadlift1rm: 140,
      ohp1rm: 50,
      preferredGymDays: ['monday', 'wednesday', 'friday'],
      preferredTimeOfDay: 'morning',
      programStartDate: '2026-05-04',
      firstSessionDate: '2026-05-04',
    });

    expect(plan.cycle).toEqual(
      expect.objectContaining({
        id: 'cycle-1',
        programSlug: 'stronglifts-5x5',
        currentWeek: 1,
        currentSession: 1,
        totalSessionsCompleted: 0,
        status: 'active',
        isComplete: false,
      }),
    );
    expect(plan.cycleWorkouts.length).toBeGreaterThan(0);
    expect(plan.cycleWorkouts[0]).toEqual(
      expect.objectContaining({
        cycleId: 'cycle-1',
        weekNumber: 1,
        sessionNumber: 1,
        isComplete: false,
        workoutId: null,
      }),
    );
    expect(JSON.parse(plan.cycleWorkouts[0].targetLifts).exercises.length).toBeGreaterThan(0);
  });

  test('throws for unknown program slug', () => {
    expect(() =>
      createProgramStartPlan({
        id: 'cycle-1',
        programSlug: 'unknown',
        name: 'Unknown',
        squat1rm: 100,
        bench1rm: 80,
        deadlift1rm: 140,
        ohp1rm: 50,
      }),
    ).toThrow('Program not found');
  });
});
