export interface WorkoutSetNavigationSet {
  id: string;
  isComplete: boolean;
}

export interface WorkoutSetNavigationExercise {
  sets: WorkoutSetNavigationSet[];
}

export type WorkoutSetNavigationResult =
  | {
      type: 'next';
      exerciseIndex: number;
      setIndex: number;
      setId: string;
    }
  | {
      type: 'final';
      exerciseIndex: number;
      setIndex: number;
      setId: string;
    }
  | null;

export function resolveSetCompletionNavigation(
  exercises: WorkoutSetNavigationExercise[],
  exerciseIndex: number,
  updatedSets: WorkoutSetNavigationSet[],
): WorkoutSetNavigationResult {
  const previousSets = exercises[exerciseIndex]?.sets;
  if (!previousSets) {
    return null;
  }

  const justCompletedIndex = updatedSets.findIndex(
    (set, index) => set.isComplete && !previousSets[index]?.isComplete,
  );

  if (justCompletedIndex < 0) {
    return null;
  }

  for (let setIndex = justCompletedIndex + 1; setIndex < updatedSets.length; setIndex++) {
    const set = updatedSets[setIndex];
    if (!set.isComplete) {
      return {
        type: 'next',
        exerciseIndex,
        setIndex,
        setId: set.id,
      };
    }
  }

  for (
    let nextExerciseIndex = exerciseIndex + 1;
    nextExerciseIndex < exercises.length;
    nextExerciseIndex++
  ) {
    const nextExercise = exercises[nextExerciseIndex];
    for (let setIndex = 0; setIndex < nextExercise.sets.length; setIndex++) {
      const set = nextExercise.sets[setIndex];
      if (!set.isComplete) {
        return {
          type: 'next',
          exerciseIndex: nextExerciseIndex,
          setIndex,
          setId: set.id,
        };
      }
    }
  }

  const completedSet = updatedSets[justCompletedIndex];
  return {
    type: 'final',
    exerciseIndex,
    setIndex: justCompletedIndex,
    setId: completedSet.id,
  };
}
