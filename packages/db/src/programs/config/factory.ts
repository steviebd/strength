import type { LiftType, ProgramInfo, ProgramDifficulty, ProgramCategory } from '../types';

const DEFAULT_MAIN_LIFTS: LiftType[] = ['squat', 'bench', 'deadlift', 'ohp'];

export function createProgramInfo(opts: {
  slug: string;
  name: string;
  description: string;
  difficulty: ProgramDifficulty;
  daysPerWeek: number;
  estimatedWeeks: number;
  totalSessions: number;
  mainLifts?: LiftType[];
  category: ProgramCategory;
}): ProgramInfo {
  return {
    ...opts,
    mainLifts: opts.mainLifts ?? DEFAULT_MAIN_LIFTS,
  };
}
