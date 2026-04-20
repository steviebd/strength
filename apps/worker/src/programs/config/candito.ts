import type { LiftType, ProgramInfo, ProgramAccessory } from '../types';

export const canditoInfo: ProgramInfo = {
  slug: 'candito-6-week',
  name: 'Candito 6 Week',
  description:
    'Block periodization with 3-week strength block followed by 3-week peaking block. Great for meet preparation.',
  difficulty: 'advanced' as const,
  daysPerWeek: 4,
  estimatedWeeks: 6,
  totalSessions: 24,
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'] as LiftType[],
  category: 'powerlifting' as const,
};

export const STRENGTH_BLOCK = [
  {
    week: 1,
    sets: [4, 3, 2, 0],
    percentages: [0.75, 0.8, 0.85],
    baseReps: 4,
    amrapPercent: 0.75,
    isDeload: false,
  },
  {
    week: 2,
    sets: [4, 3, 2, 0],
    percentages: [0.8, 0.85, 0.9],
    baseReps: 3,
    amrapPercent: 0.8,
    isDeload: false,
  },
  {
    week: 3,
    sets: [4, 3, 2, 0],
    percentages: [0.85, 0.9, 0.95],
    baseReps: 2,
    amrapPercent: 0.85,
    isDeload: false,
  },
] as const;

export const PEAKING_BLOCK = [
  {
    week: 4,
    sets: [3, 2, 2, 0],
    percentages: [0.875, 0.925, 0.975],
    baseReps: 3,
    amrapPercent: 0.875,
    isDeload: false,
  },
  {
    week: 5,
    sets: [3, 2, 1, 0],
    percentages: [0.925, 0.95, 1.0],
    baseReps: 2,
    amrapPercent: 0.925,
    isDeload: false,
  },
  {
    week: 6,
    sets: [2, 2, 1, 0],
    percentages: [0.95, 0.975, 1.025],
    baseReps: 2,
    amrapPercent: 0,
    isDeload: true,
  },
] as const;

export const canditoAccessories: ProgramAccessory[] = [
  { accessoryId: 'dumbbell-row', sets: 3, reps: '6-12', isRequired: true },
  { accessoryId: 'dumbbell-ohp', sets: 3, reps: '6-12', isRequired: true },
  { accessoryId: 'weighted-pullups', sets: 3, reps: '6-12', isRequired: true },
  { accessoryId: 'romanian-dl', sets: 3, reps: 8, isRequired: true },
];

export function getCanditoAccessories(_week: number, session: number): ProgramAccessory[] {
  const dayIndex = (session - 1) % 4;
  if (dayIndex > 1) return [];
  return canditoAccessories;
}
