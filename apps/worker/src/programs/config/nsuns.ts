import type { ProgramInfo, ProgramAccessory } from '../types';
import { createProgramInfo } from './factory';

export const nsunsInfo: ProgramInfo = createProgramInfo({
  slug: 'nsuns-lp',
  name: 'nSuns LP',
  description:
    'High volume linear progression. Excellent for building base strength with paired T1/T2 lifts.',
  difficulty: 'intermediate',
  daysPerWeek: 4,
  estimatedWeeks: 8,
  totalSessions: 32,
  category: 'powerlifting',
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'],
});

export const nsunsRequiredAccessories: ProgramAccessory[] = [
  { accessoryId: 'rows', sets: 3, reps: '8-12', isRequired: true },
  { accessoryId: 'pullups', sets: 3, reps: 'AMRAP', isRequired: true },
  { accessoryId: 'face-pulls', sets: 3, reps: '15-20', isRequired: true },
];

export const nsunsSuggestedAccessories: Record<number, ProgramAccessory[]> = {
  1: [
    { accessoryId: 'tricep-pushdowns', sets: 3, reps: '8-12', isRequired: false },
    { accessoryId: 'lateral-raises', sets: 3, reps: '12-15', isRequired: false },
  ],
  2: [
    { accessoryId: 'romanian-dl', sets: 3, reps: '5-8', isRequired: false },
    { accessoryId: 'leg-extensions', sets: 3, reps: '12-15', isRequired: false },
  ],
  3: [
    { accessoryId: 'dumbbell-row', sets: 3, reps: '8-12', isRequired: false },
    { accessoryId: 'skullcrushers', sets: 3, reps: '8-12', isRequired: false },
  ],
  4: [{ accessoryId: 'leg-curls', sets: 3, reps: '12-15', isRequired: false }],
};

export function getNsunsAccessories(_week: number, session: number): ProgramAccessory[] {
  const dayIndex = ((session - 1) % 4) + 1;
  const required = nsunsRequiredAccessories;
  const suggested = nsunsSuggestedAccessories[dayIndex] || [];
  return [...required, ...suggested];
}
