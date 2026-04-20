export type LiftType = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row';

export type ProgramDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type ProgramCategory = 'powerlifting' | 'general-strength' | "women's";

export interface ProgramInfo {
  slug: string;
  name: string;
  description: string;
  difficulty: ProgramDifficulty;
  daysPerWeek: number;
  estimatedWeeks: number;
  totalSessions: number;
  mainLifts: LiftType[];
  category: ProgramCategory;
}

export interface ProgramExercise {
  name: string;
  lift: LiftType;
  sets: number;
  reps: number;
  isAmrap?: boolean;
}

export interface ProgramSession {
  weekNumber: number;
  sessionNumber: number;
  name: string;
  exercises: ProgramExercise[];
}

export interface OneRMValues {
  squat: number;
  bench: number;
  deadlift: number;
  ohp: number;
}

export interface ProgramWorkout {
  weekNumber: number;
  sessionNumber: number;
  sessionName: string;
  exercises: Array<{
    name: string;
    lift: LiftType;
    sets: number;
    reps: number;
    targetWeight: number;
    isAmrap?: boolean;
  }>;
  accessories?: WorkoutAccessory[];
}

export interface ProgramConfig {
  info: ProgramInfo;
  generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[];
  calculateTargetWeight(
    estimatedOneRM: number,
    week: number,
    session: number,
    lift: LiftType,
  ): number;
  getAccessories?(week: number, session: number): ProgramAccessory[];
}

export interface ProgramListItem {
  slug: string;
  name: string;
  description: string;
  difficulty: ProgramDifficulty;
  daysPerWeek: number;
  estimatedWeeks: number;
  category: ProgramCategory;
}

export const PROGRAM_SLUGS = {
  stronglifts5x5: 'stronglifts-5x5',
  wendler531: '531',
  madcow5x5: 'madcow-5x5',
  candito6Week: 'candito-6-week',
  nsunsLp: 'nsuns-lp',
  sheiko: 'sheiko',
  nuckols28: 'nuckols-28-programs',
  megsquatsStrongerByTheDay: 'stronger-by-the-day',
  jenSinklerUnapologeticallyStrong: 'unapologetically-strong',
} as const;

export type ProgramSlug = (typeof PROGRAM_SLUGS)[keyof typeof PROGRAM_SLUGS];

export type AccessoryCategory = 'push' | 'pull' | 'leg' | 'core';

export interface AccessoryDefinition {
  id: string;
  name: string;
  category: AccessoryCategory;
  baseLift: LiftType | null;
  defaultPercentage: number | null;
  muscleGroup: string;
  libraryId: string;
}

export interface ProgramAccessory {
  accessoryId: string;
  sets: number;
  reps: number | string;
  targetPercentage?: number;
  isRequired: boolean;
  notes?: string;
}

export interface WorkoutAccessory {
  accessoryId: string;
  name: string;
  libraryId?: string;
  muscleGroup: string;
  sets: number;
  reps: number | string;
  targetWeight: number;
  addedWeight: number;
  isRequired: boolean;
}
