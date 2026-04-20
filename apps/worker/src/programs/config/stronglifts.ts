import type { LiftType, ProgramInfo, ProgramAccessory } from '../types';

export const strongliftsInfo: ProgramInfo = {
  slug: 'stronglifts-5x5',
  name: 'StrongLifts 5×5',
  description:
    'The classic beginner program that has helped millions get stronger. Simple, effective, and proven.',
  difficulty: 'beginner' as const,
  daysPerWeek: 3,
  estimatedWeeks: 8,
  totalSessions: 24,
  mainLifts: ['squat', 'bench', 'deadlift', 'ohp', 'row'] as LiftType[],
  category: 'general-strength' as const,
};

export const strongliftsAccessories: ProgramAccessory[] = [
  { accessoryId: 'pullups', sets: 3, reps: 8, isRequired: false },
  { accessoryId: 'dips', sets: 3, reps: 8, isRequired: false },
  { accessoryId: 'skullcrushers', sets: 3, reps: 8, isRequired: false },
  { accessoryId: 'barbell-curl', sets: 3, reps: 8, isRequired: false },
];

export function getStrongliftsAccessories(_week: number, session: number): ProgramAccessory[] {
  const isDayA = session % 2 === 1;
  return strongliftsAccessories.filter((acc) => {
    if (isDayA) {
      return ['pullups', 'dips', 'skullcrushers'].includes(acc.accessoryId);
    }
    return ['barbell-curl'].includes(acc.accessoryId);
  });
}
