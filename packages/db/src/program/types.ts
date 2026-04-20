export interface CreateProgramCycleData {
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
  programStartDate?: string;
  firstSessionDate?: string;
  workouts: Array<{
    weekNumber: number;
    sessionNumber: number;
    sessionName: string;
    scheduledDate?: string;
    scheduledTime?: string;
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
