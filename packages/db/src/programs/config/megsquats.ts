import type { ProgramInfo, ProgramAccessory } from '../types';
import { createProgramInfo } from './factory';

export const megsquatsInfo: ProgramInfo = createProgramInfo({
  slug: 'stronger-by-the-day',
  name: 'Stronger by the Day (Megsquats)',
  description:
    'A 12-week upper/lower split program designed specifically for women, featuring training max progression and glute-focused accessories.',
  difficulty: 'beginner',
  daysPerWeek: 3,
  estimatedWeeks: 12,
  totalSessions: 36,
  category: "women's",
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp'],
});

export const megsquatsAccessories: ProgramAccessory[] = [
  { accessoryId: 'hip-thrust', sets: 3, reps: 10, isRequired: true },
  { accessoryId: 'romanian-dl', sets: 3, reps: 10, isRequired: false },
  { accessoryId: 'leg-press', sets: 3, reps: 12, isRequired: false },
  { accessoryId: 'leg-curls', sets: 3, reps: 12, isRequired: false },
  { accessoryId: 'planks', sets: 3, reps: '30 sec', isRequired: false },
];

export const megsquatsUpperAccessories: ProgramAccessory[] = [
  { accessoryId: 'pullups', sets: 3, reps: 8, isRequired: false },
  { accessoryId: 'lat-pulldowns', sets: 3, reps: 10, isRequired: false },
  { accessoryId: 'tricep-pushdowns', sets: 3, reps: 12, isRequired: false },
  { accessoryId: 'face-pulls', sets: 3, reps: 15, isRequired: false },
  { accessoryId: 'lateral-raises', sets: 3, reps: 15, isRequired: false },
];

export function getMegsquatsAccessories(_week: number, session: number): ProgramAccessory[] {
  const dayOfWeek = ((session - 1) % 3) + 1;
  const isLowerA = dayOfWeek === 1;
  const isUpperA = dayOfWeek === 2;

  if (isLowerA) {
    return megsquatsAccessories.filter((acc) => ['leg-curls', 'planks'].includes(acc.accessoryId));
  }

  if (isUpperA) {
    return megsquatsUpperAccessories.filter((acc) =>
      ['lat-pulldowns', 'lateral-raises'].includes(acc.accessoryId),
    );
  }

  return megsquatsAccessories.filter((acc) => ['hip-thrust', 'planks'].includes(acc.accessoryId));
}
