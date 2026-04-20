import type { LiftType, ProgramInfo, ProgramAccessory } from '../types';

export const sheikoInfo: ProgramInfo = {
  slug: 'sheiko',
  name: 'Sheiko',
  description:
    'Russian-style high volume programming at moderate intensity. Excellent for technique work and building work capacity.',
  difficulty: 'advanced' as const,
  daysPerWeek: 4,
  estimatedWeeks: 8,
  totalSessions: 32,
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'] as LiftType[],
  category: 'powerlifting' as const,
};

export const VOLUME_DAY = {
  squat: { sets: 6, reps: 3, percentage: 0.75 },
  bench: { sets: 4, reps: 4, percentage: 0.7 },
  deadlift: { sets: 5, reps: 3, percentage: 0.8 },
  ohp: { sets: 4, reps: 4, percentage: 0.65 },
};

export const INTENSITY_DAY = {
  squat: { sets: 5, reps: 2, percentage: 0.85 },
  bench: { sets: 3, reps: 2, percentage: 0.75 },
  deadlift: { sets: 4, reps: 2, percentage: 0.9 },
  ohp: { sets: 3, reps: 2, percentage: 0.7 },
};

export const sheikoAccessories: ProgramAccessory[] = [
  { accessoryId: 'pullups', sets: 4, reps: '8-12', isRequired: false },
  { accessoryId: 'dumbbell-row', sets: 3, reps: '8-12', isRequired: false },
  { accessoryId: 'dumbbell-curl', sets: 3, reps: '8-12', isRequired: false },
  { accessoryId: 'planks', sets: 3, reps: '30sec', isRequired: false },
  { accessoryId: 'face-pulls', sets: 3, reps: '15-20', isRequired: false },
];

export function getSheikoAccessories(_week: number, _session: number): ProgramAccessory[] {
  return sheikoAccessories;
}
