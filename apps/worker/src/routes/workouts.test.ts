import { describe, expect, test } from 'vitest';
import { buildWorkoutSetUpdate, buildWorkoutUpdate } from './workouts';

describe('workout update allowlists', () => {
  test('buildWorkoutUpdate rejects protected fields', () => {
    const result = buildWorkoutUpdate({
      name: 'Heavy Day',
      notes: 'Felt good',
      completedAt: '2026-04-28T00:00:00.000Z',
      id: 'workout-evil',
      userId: 'user-evil',
      templateId: 'template-evil',
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: true,
    });

    expect(result).toEqual({
      name: 'Heavy Day',
      notes: 'Felt good',
      completedAt: '2026-04-28T00:00:00.000Z',
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('templateId');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
    expect(result).not.toHaveProperty('isDeleted');
  });

  test('buildWorkoutSetUpdate rejects protected fields', () => {
    const result = buildWorkoutSetUpdate({
      setNumber: 2,
      weight: 100,
      reps: 5,
      rpe: 8,
      isComplete: true,
      id: 'set-evil',
      workoutExerciseId: 'exercise-evil',
      userId: 'user-evil',
      completedAt: new Date(),
      isDeleted: true,
    });

    expect(result).toEqual({
      setNumber: 2,
      weight: 100,
      reps: 5,
      rpe: 8,
      isComplete: true,
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('workoutExerciseId');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('completedAt');
    expect(result).not.toHaveProperty('isDeleted');
  });
});
