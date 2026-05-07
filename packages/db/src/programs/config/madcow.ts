import type { ProgramInfo, ProgramAccessory } from '../types';
import { createProgramInfo } from './factory';

export const madcowInfo: ProgramInfo = createProgramInfo({
  slug: 'madcow-5x5',
  name: 'Madcow 5×5',
  description: 'Bridge from beginner to advanced. Built-in deloads and weekly weight increases.',
  difficulty: 'intermediate',
  daysPerWeek: 3,
  estimatedWeeks: 8,
  totalSessions: 24,
  category: 'powerlifting',
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'],
});

export const WEEK_PERCENTAGES = [
  { squat: 1.025, bench: 1.025, deadlift: 1.025, ohp: 1.025 },
  { squat: 0.975, bench: 0.975, deadlift: 0.975, ohp: 0.975 },
  { squat: 1.0, bench: 1.0, deadlift: 1.0, ohp: 1.0 },
  { squat: 1.05, bench: 1.05, deadlift: 1.05, ohp: 1.05 },
  { squat: 1.0, bench: 1.0, deadlift: 1.0, ohp: 1.0 },
  { squat: 1.025, bench: 1.025, deadlift: 1.025, ohp: 1.025 },
  { squat: 1.075, bench: 1.075, deadlift: 1.075, ohp: 1.075 },
  { squat: 1.05, bench: 1.05, deadlift: 1.05, ohp: 1.05, isDeload: true },
];

export const madcowAccessories: ProgramAccessory[] = [
  { accessoryId: 'dips', sets: 3, reps: 8, isRequired: false },
  { accessoryId: 'hyperextensions', sets: 2, reps: '10-12', isRequired: false },
  { accessoryId: 'pullups', sets: 3, reps: 8, isRequired: false },
  { accessoryId: 'planks', sets: 3, reps: '30sec', isRequired: false },
  { accessoryId: 'barbell-curl', sets: 3, reps: 8, isRequired: false },
  { accessoryId: 'skullcrushers', sets: 3, reps: 8, isRequired: false },
];

export function getMadcowAccessories(_week: number, session: number): ProgramAccessory[] {
  const dayIndex = (session - 1) % 3;
  if (dayIndex === 0) {
    return madcowAccessories.filter((a) => ['dips', 'hyperextensions'].includes(a.accessoryId));
  }
  if (dayIndex === 1) {
    return madcowAccessories.filter((a) => ['pullups', 'planks'].includes(a.accessoryId));
  }
  return madcowAccessories.filter((a) => ['barbell-curl', 'skullcrushers'].includes(a.accessoryId));
}
