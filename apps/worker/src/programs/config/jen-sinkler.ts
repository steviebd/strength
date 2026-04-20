import type { LiftType, ProgramInfo, ProgramAccessory } from '../types';

export const jenSinklerInfo: ProgramInfo = {
  slug: 'unapologetically-strong',
  name: 'Unapologetically Strong (Jen Sinkler)',
  description:
    'An 8-week full body strength program designed to build a solid foundation of power and confidence.',
  difficulty: 'intermediate' as const,
  daysPerWeek: 3,
  estimatedWeeks: 8,
  totalSessions: 24,
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'] as LiftType[],
  category: "women's" as const,
};

export const fullBodyAccessories: ProgramAccessory[] = [
  { accessoryId: 'planks', sets: 3, reps: '45 sec', isRequired: false, notes: 'Core finisher' },
  { accessoryId: 'lunges', sets: 3, reps: 12, isRequired: false },
];

export function getJenSinklerAccessories(_week: number, session: number): ProgramAccessory[] {
  if (session === 1) {
    return [{ accessoryId: 'planks', sets: 3, reps: '45 sec', isRequired: false }];
  }

  if (session === 2) {
    return [
      { accessoryId: 'dumbbell-curl', sets: 3, reps: 12, isRequired: false },
      { accessoryId: 'lateral-raises', sets: 3, reps: 15, isRequired: false },
    ];
  }

  return fullBodyAccessories;
}
