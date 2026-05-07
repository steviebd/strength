export interface ProgramAdvanceCycleInput {
  id: string;
  currentWeek?: number | null;
  currentSession?: number | null;
  totalSessionsCompleted?: number | null;
  totalSessionsPlanned?: number | null;
  status?: string | null;
  isComplete?: boolean | null;
}

export interface ProgramAdvanceWorkoutInput {
  id: string;
  weekNumber: number;
  sessionNumber: number;
  isComplete?: boolean | null;
  workoutId?: string | null;
}

export interface ProgramAdvancePlan {
  programCycleId: string;
  completedCycleWorkoutId: string;
  workoutId: string;
  currentWeek: number | null;
  currentSession: number | null;
  totalSessionsCompleted: number;
  status: 'active' | 'completed';
  isComplete: boolean;
}

function sortCycleWorkouts(workouts: ProgramAdvanceWorkoutInput[]) {
  return [...workouts].sort((a, b) => {
    const weekDiff = a.weekNumber - b.weekNumber;
    if (weekDiff !== 0) return weekDiff;
    return a.sessionNumber - b.sessionNumber;
  });
}

export function createProgramAdvancePlan(input: {
  cycle: ProgramAdvanceCycleInput;
  workouts: ProgramAdvanceWorkoutInput[];
  completedCycleWorkoutId: string;
  workoutId: string;
}): ProgramAdvancePlan {
  const orderedWorkouts = sortCycleWorkouts(input.workouts);
  const completedWorkout = orderedWorkouts.find(
    (workout) => workout.id === input.completedCycleWorkoutId,
  );

  if (!completedWorkout) {
    throw new Error('Completed cycle workout not found');
  }

  const completedIds = new Set(
    orderedWorkouts
      .filter((workout) => workout.isComplete || workout.id === input.completedCycleWorkoutId)
      .map((workout) => workout.id),
  );
  const nextWorkout = orderedWorkouts.find((workout) => !completedIds.has(workout.id));
  const totalSessionsCompleted = Math.min(
    input.cycle.totalSessionsPlanned ?? orderedWorkouts.length,
    completedIds.size,
  );
  const isComplete = !nextWorkout;

  return {
    programCycleId: input.cycle.id,
    completedCycleWorkoutId: input.completedCycleWorkoutId,
    workoutId: input.workoutId,
    currentWeek: nextWorkout?.weekNumber ?? null,
    currentSession: nextWorkout?.sessionNumber ?? null,
    totalSessionsCompleted,
    status: isComplete ? 'completed' : 'active',
    isComplete,
  };
}
