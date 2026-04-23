import { describe, expect, test } from 'vitest';
import type { AuthContext } from './auth';
import {
  requireOwnedProgramCycleWorkout,
  requireOwnedTemplate,
  requireOwnedWorkoutSet,
} from './guards';

function createDb(row: unknown) {
  const builder = {
    select: () => builder,
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    get: async () => row,
  };
  return builder;
}

function createAuthContext(row: unknown): AuthContext {
  return {
    db: createDb(row) as never,
    userId: 'user-1',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: 'session-1',
      token: 'token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe('ownership guards', () => {
  test('returns an owned template row', async () => {
    const row = { id: 'template-1', userId: 'user-1' };
    const result = await requireOwnedTemplate(createAuthContext(row), 'template-1');

    expect(result).toBe(row);
  });

  test("returns 404 for another user's template", async () => {
    const result = await requireOwnedTemplate(createAuthContext(undefined), 'template-1');

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  test('resolves an owned workout set through its workout parent', async () => {
    const row = { id: 'set-1', workoutExerciseId: 'workout-exercise-1' };
    const result = await requireOwnedWorkoutSet(createAuthContext(row), 'set-1');

    expect(result).toBe(row);
  });

  test("returns 404 for another user's workout set", async () => {
    const result = await requireOwnedWorkoutSet(createAuthContext(undefined), 'set-1');

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  test('resolves a program cycle workout through userProgramCycles.userId', async () => {
    const row = { id: 'cycle-workout-1', cycleId: 'cycle-1' };
    const result = await requireOwnedProgramCycleWorkout(createAuthContext(row), 'cycle-workout-1');

    expect(result).toBe(row);
  });

  test("returns 404 for another user's program cycle workout", async () => {
    const result = await requireOwnedProgramCycleWorkout(
      createAuthContext(undefined),
      'cycle-workout-1',
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });
});
