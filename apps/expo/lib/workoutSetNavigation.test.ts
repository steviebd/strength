import { describe, expect, it } from 'vitest';
import {
  resolveSetCompletionNavigation,
  type WorkoutSetNavigationExercise,
} from './workoutSetNavigation';

function exercisesFrom(completedSets: boolean[][]): WorkoutSetNavigationExercise[] {
  return completedSets.map((sets, exerciseIndex) => ({
    sets: sets.map((isComplete, setIndex) => ({
      id: `exercise-${exerciseIndex}-set-${setIndex}`,
      isComplete,
    })),
  }));
}

describe('resolveSetCompletionNavigation', () => {
  it('targets set 2 in the same exercise after completing set 1', () => {
    const exercises = exercisesFrom([[false, false], [false]]);

    expect(
      resolveSetCompletionNavigation(exercises, 0, [
        { id: 'exercise-0-set-0', isComplete: true },
        { id: 'exercise-0-set-1', isComplete: false },
      ]),
    ).toEqual({
      type: 'next',
      exerciseIndex: 0,
      setIndex: 1,
      setId: 'exercise-0-set-1',
    });
  });

  it('targets the first incomplete set in the next exercise after completing the last current set', () => {
    const exercises = exercisesFrom([[true, false], [false]]);

    expect(
      resolveSetCompletionNavigation(exercises, 0, [
        { id: 'exercise-0-set-0', isComplete: true },
        { id: 'exercise-0-set-1', isComplete: true },
      ]),
    ).toEqual({
      type: 'next',
      exerciseIndex: 1,
      setIndex: 0,
      setId: 'exercise-1-set-0',
    });
  });

  it('skips completed later sets in the same exercise', () => {
    const exercises = exercisesFrom([[false, true, false]]);

    expect(
      resolveSetCompletionNavigation(exercises, 0, [
        { id: 'exercise-0-set-0', isComplete: true },
        { id: 'exercise-0-set-1', isComplete: true },
        { id: 'exercise-0-set-2', isComplete: false },
      ]),
    ).toEqual({
      type: 'next',
      exerciseIndex: 0,
      setIndex: 2,
      setId: 'exercise-0-set-2',
    });
  });

  it('returns a final target after completing the final incomplete set', () => {
    const exercises = exercisesFrom([[true], [false]]);

    expect(
      resolveSetCompletionNavigation(exercises, 1, [{ id: 'exercise-1-set-0', isComplete: true }]),
    ).toEqual({
      type: 'final',
      exerciseIndex: 1,
      setIndex: 0,
      setId: 'exercise-1-set-0',
    });
  });

  it('does not target anything when editing or toggling an already-complete set', () => {
    const exercises = exercisesFrom([[true, false]]);

    expect(
      resolveSetCompletionNavigation(exercises, 0, [
        { id: 'exercise-0-set-0', isComplete: true },
        { id: 'exercise-0-set-1', isComplete: false },
      ]),
    ).toBeNull();
  });
});
