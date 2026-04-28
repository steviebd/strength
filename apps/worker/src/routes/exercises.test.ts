import { describe, expect, test } from 'vitest';
import { buildExerciseUpdate } from './exercises';

describe('buildExerciseUpdate', () => {
  test('allows allowed fields', () => {
    const body = { name: 'Squat', muscleGroup: 'Legs', description: 'Barbell' };
    expect(buildExerciseUpdate(body)).toEqual(body);
  });

  test('rejects protected fields', () => {
    const body = {
      name: 'Squat',
      userId: 'evil',
      id: '123',
      libraryId: 'lib1',
      createdAt: new Date(),
      isDeleted: true,
    };
    const result = buildExerciseUpdate(body);
    expect(result).toEqual({ name: 'Squat' });
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('libraryId');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('isDeleted');
  });
});
