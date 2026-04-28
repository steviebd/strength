import { describe, expect, test } from 'vitest';
import {
  exercises,
  generateId,
  nutritionEntries,
  templates,
  userPreferences,
  workouts,
} from './schema';
import { getVideoTutorialByName } from './exercise-library';

describe('schema guardrails', () => {
  test('generateId returns UUID-shaped strings', () => {
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test('keeps critical table and column names stable', () => {
    expect(userPreferences.userId.name).toBe('user_id');
    expect(userPreferences.weightUnit.name).toBe('weight_unit');
    expect(exercises.libraryId.name).toBe('library_id');
    expect(templates.userId.name).toBe('user_id');
    expect(workouts.completedAt.name).toBe('completed_at');
    expect(nutritionEntries.loggedAt.name).toBe('logged_at');
    expect(nutritionEntries.isDeleted.name).toBe('is_deleted');
  });

  test('exercise library resolves canonical tutorial names', () => {
    expect(getVideoTutorialByName('Squat')?.title).toContain('Squat');
    expect(getVideoTutorialByName('Bench Press')?.title).toContain('Bench Press');
    expect(getVideoTutorialByName('Definitely Not A Lift')).toBeUndefined();
  });
});
