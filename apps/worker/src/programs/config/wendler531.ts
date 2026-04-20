import type { LiftType, ProgramInfo, ProgramAccessory } from '../types';

export const wendler531Info: ProgramInfo = {
  slug: '531',
  name: '5/3/1 (Wendler)',
  description:
    'The most popular strength program ever created. Flexible, sustainable, and proven to work.',
  difficulty: 'intermediate' as const,
  daysPerWeek: 4,
  estimatedWeeks: 12,
  totalSessions: 48,
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'] as LiftType[],
  category: 'powerlifting' as const,
};

export const WAVE_PERCENTAGES = {
  1: { sets: [0.65, 0.75, 0.85], reps: [5, 5, 5] },
  2: { sets: [0.7, 0.8, 0.9], reps: [3, 3, 3] },
  3: { sets: [0.75, 0.85, 0.95], reps: [5, 3, 5] },
  4: { sets: [0.4, 0.5, 0.6], reps: [5, 5, 5] },
};

export function getWendlerAccessories(_week: number, session: number): ProgramAccessory[] {
  const dayIndex = (session - 1) % 4;

  const pushAccessories: ProgramAccessory[] = [
    { accessoryId: 'dips', sets: 3, reps: '50-100 reps total', isRequired: true },
    { accessoryId: 'pushups', sets: 4, reps: 15, isRequired: true },
  ];

  const pullAccessories: ProgramAccessory[] = [
    { accessoryId: 'pullups', sets: 3, reps: '50-100 reps total', isRequired: true },
    { accessoryId: 'rows', sets: 3, reps: 10, isRequired: true },
  ];

  const coreAccessories: ProgramAccessory[] = [
    { accessoryId: 'planks', sets: 3, reps: '45sec', isRequired: true },
    { accessoryId: 'lunges', sets: 3, reps: 12, isRequired: true },
  ];

  if (dayIndex === 0) return [...pushAccessories, ...coreAccessories];
  if (dayIndex === 1) return [...pushAccessories, ...pullAccessories];
  if (dayIndex === 2) return [...pullAccessories, ...coreAccessories];
  return [...pushAccessories, ...pullAccessories, ...coreAccessories];
}
