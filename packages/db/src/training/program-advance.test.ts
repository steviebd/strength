import { describe, expect, test } from 'vitest';
import { createProgramAdvancePlan } from './program-advance';

const cycle = {
  id: 'cycle-1',
  currentWeek: 1,
  currentSession: 1,
  totalSessionsCompleted: 0,
  totalSessionsPlanned: 3,
  status: 'active',
  isComplete: false,
};

const workouts = [
  { id: 'cw-1', weekNumber: 1, sessionNumber: 1, isComplete: false },
  { id: 'cw-2', weekNumber: 1, sessionNumber: 2, isComplete: false },
  { id: 'cw-3', weekNumber: 2, sessionNumber: 1, isComplete: false },
];

describe('createProgramAdvancePlan', () => {
  test('advances to the next incomplete workout', () => {
    const plan = createProgramAdvancePlan({
      cycle,
      workouts,
      completedCycleWorkoutId: 'cw-1',
      workoutId: 'workout-1',
    });

    expect(plan).toEqual({
      programCycleId: 'cycle-1',
      completedCycleWorkoutId: 'cw-1',
      workoutId: 'workout-1',
      currentWeek: 1,
      currentSession: 2,
      totalSessionsCompleted: 1,
      status: 'active',
      isComplete: false,
    });
  });

  test('skips workouts already marked complete', () => {
    const plan = createProgramAdvancePlan({
      cycle: { ...cycle, totalSessionsCompleted: 1 },
      workouts: [
        { id: 'cw-1', weekNumber: 1, sessionNumber: 1, isComplete: true },
        { id: 'cw-2', weekNumber: 1, sessionNumber: 2, isComplete: false },
        { id: 'cw-3', weekNumber: 2, sessionNumber: 1, isComplete: false },
      ],
      completedCycleWorkoutId: 'cw-2',
      workoutId: 'workout-2',
    });

    expect(plan.currentWeek).toBe(2);
    expect(plan.currentSession).toBe(1);
    expect(plan.totalSessionsCompleted).toBe(2);
    expect(plan.status).toBe('active');
  });

  test('marks the cycle complete after the final incomplete workout', () => {
    const plan = createProgramAdvancePlan({
      cycle: { ...cycle, totalSessionsCompleted: 2 },
      workouts: [
        { id: 'cw-1', weekNumber: 1, sessionNumber: 1, isComplete: true },
        { id: 'cw-2', weekNumber: 1, sessionNumber: 2, isComplete: true },
        { id: 'cw-3', weekNumber: 2, sessionNumber: 1, isComplete: false },
      ],
      completedCycleWorkoutId: 'cw-3',
      workoutId: 'workout-3',
    });

    expect(plan.currentWeek).toBeNull();
    expect(plan.currentSession).toBeNull();
    expect(plan.totalSessionsCompleted).toBe(3);
    expect(plan.status).toBe('completed');
    expect(plan.isComplete).toBe(true);
  });

  test('throws when the completed cycle workout is not in the cycle', () => {
    expect(() =>
      createProgramAdvancePlan({
        cycle,
        workouts,
        completedCycleWorkoutId: 'missing',
        workoutId: 'workout-1',
      }),
    ).toThrow('Completed cycle workout not found');
  });
});
