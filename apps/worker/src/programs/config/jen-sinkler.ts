import type { ProgramInfo, ProgramAccessory } from '../types';
import { createProgramInfo } from './factory';

export const jenSinklerInfo: ProgramInfo = createProgramInfo({
  slug: 'unapologetically-strong',
  name: 'Unapologetically Strong (Jen Sinkler)',
  description:
    'An 8-week full body strength program designed to build a solid foundation of power and confidence.',
  difficulty: 'intermediate',
  daysPerWeek: 3,
  estimatedWeeks: 8,
  totalSessions: 24,
  category: "women's",
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'],
});

export const fullBodyAccessories: ProgramAccessory[] = [
  { accessoryId: 'planks', sets: 3, reps: '45 sec', isRequired: false, notes: 'Core finisher' },
  { accessoryId: 'lunges', sets: 3, reps: 12, isRequired: false },
];

export function getJenSinklerAccessories(_week: number, session: number): ProgramAccessory[] {
  const dayOfWeek = ((session - 1) % 3) + 1;

  if (dayOfWeek === 1) {
    return [{ accessoryId: 'planks', sets: 3, reps: '45 sec', isRequired: false }];
  }

  if (dayOfWeek === 2) {
    return [
      { accessoryId: 'dumbbell-curl', sets: 3, reps: 12, isRequired: false },
      { accessoryId: 'lateral-raises', sets: 3, reps: 15, isRequired: false },
    ];
  }

  return fullBodyAccessories;
}
