export interface CreateProgramCycleData {
  id?: string;
  programSlug: string;
  name: string;
  squat1rm: number;
  bench1rm: number;
  deadlift1rm: number;
  ohp1rm: number;
  totalSessionsPlanned: number;
  estimatedWeeks?: number;
  preferredGymDays?: string;
  preferredTimeOfDay?: string;
  programStartAt: number;
  firstSessionAt?: number;
  workouts: Array<{
    weekNumber: number;
    sessionNumber: number;
    sessionName: string;
    scheduledAt?: number;
    targetLifts?: string;
  }>;
}

export interface TargetLift {
  name: string;
  lift?: string;
  targetWeight: number;
  sets: number;
  reps: number | string;
  isAccessory?: boolean;
  isRequired?: boolean;
  accessoryId?: string;
  addedWeight?: number;
  isAmrap?: boolean;
}

export interface ProgramCycleWorkoutData {
  weekNumber: number;
  sessionNumber: number;
  sessionName: string;
  exercises: Array<{
    name: string;
    lift?: string;
    targetWeight: number;
    sets: number;
    reps: number;
  }>;
  accessories?: Array<{
    name: string;
    accessoryId?: string;
    targetWeight?: number;
    sets?: number;
    reps?: number | string;
    isAccessory?: boolean;
    isRequired?: boolean;
  }>;
}
