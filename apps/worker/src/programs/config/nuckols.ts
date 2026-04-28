import type { ProgramInfo, ProgramAccessory } from '../types';
import { createProgramInfo } from './factory';

export const nuckolsInfo: ProgramInfo = createProgramInfo({
  slug: 'nuckols-28-programs',
  name: 'Greg Nuckols 28 Programs',
  description:
    'Science-backed programming with 4-week wave periodization. Evidence-based progression for intermediate lifters.',
  difficulty: 'intermediate',
  daysPerWeek: 4,
  estimatedWeeks: 8,
  totalSessions: 32,
  category: 'general-strength',
});

export const WAVE_1 = {
  week1: { t1: [0.7, 0.8, 0.9], t2: [0.6, 0.7, 0.8] },
  week2: { t1: [0.725, 0.825, 0.925], t2: [0.625, 0.725, 0.825] },
  week3: { t1: [0.75, 0.85, 0.95], t2: [0.65, 0.75, 0.85] },
  week4: { t1: [0.6, 0.7, 0.8], t2: [0.5, 0.6, 0.7] },
};

export const WAVE_2 = {
  week1: { t1: [0.725, 0.825, 0.925], t2: [0.625, 0.725, 0.825] },
  week2: { t1: [0.75, 0.85, 0.95], t2: [0.65, 0.75, 0.85] },
  week3: { t1: [0.775, 0.875, 0.975], t2: [0.675, 0.775, 0.875] },
  week4: { t1: [0.625, 0.725, 0.825], t2: [0.525, 0.625, 0.725] },
};

export const nuckolsSuggestedAccessories: ProgramAccessory[] = [
  { accessoryId: 'dips', sets: 3, reps: '8-12', isRequired: false },
  { accessoryId: 'pushups', sets: 3, reps: '15-20', isRequired: false },
  { accessoryId: 'tricep-pushdowns', sets: 3, reps: '10-15', isRequired: false },
  { accessoryId: 'pullups', sets: 3, reps: 'AMRAP', isRequired: false },
  { accessoryId: 'rows', sets: 3, reps: '8-12', isRequired: false },
  { accessoryId: 'face-pulls', sets: 3, reps: '15-20', isRequired: false },
  { accessoryId: 'romanian-dl', sets: 3, reps: '8-12', isRequired: false },
  { accessoryId: 'leg-curls', sets: 3, reps: '10-15', isRequired: false },
  { accessoryId: 'leg-extensions', sets: 3, reps: '10-15', isRequired: false },
  { accessoryId: 'planks', sets: 3, reps: '30-60sec', isRequired: false },
  { accessoryId: 'hanging-leg-raises', sets: 3, reps: '10-15', isRequired: false },
];

export function getNuckolsAccessories(_week: number, _session: number): ProgramAccessory[] {
  return [];
}
