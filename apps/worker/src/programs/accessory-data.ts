import { roundToPlate } from './utils';
import type { AccessoryDefinition, ProgramAccessory, WorkoutAccessory, OneRMValues } from './types';

export const ACCESSORIES: Record<string, AccessoryDefinition> = {
  dips: {
    id: 'dips',
    name: 'Dips',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.5,
    muscleGroup: 'Chest',
    libraryId: 'chest-dips',
  },
  'weighted-dips': {
    id: 'weighted-dips',
    name: 'Weighted Dips',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.5,
    muscleGroup: 'Chest',
    libraryId: 'weighted-dips',
  },
  pushups: {
    id: 'pushups',
    name: 'Push-ups',
    category: 'push',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Chest',
    libraryId: 'push-ups',
  },
  skullcrushers: {
    id: 'skullcrushers',
    name: 'Skull Crushers',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.35,
    muscleGroup: 'Triceps',
    libraryId: 'skull-crushers',
  },
  'tricep-pushdowns': {
    id: 'tricep-pushdowns',
    name: 'Tricep Pushdowns',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.25,
    muscleGroup: 'Triceps',
    libraryId: 'tricep-pushdown',
  },
  'tricep-extensions': {
    id: 'tricep-extensions',
    name: 'Overhead Tricep Extension',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.3,
    muscleGroup: 'Triceps',
    libraryId: 'overhead-tricep-extension',
  },
  'lateral-raises': {
    id: 'lateral-raises',
    name: 'Lateral Raises',
    category: 'push',
    baseLift: 'ohp',
    defaultPercentage: 0.15,
    muscleGroup: 'Shoulders',
    libraryId: 'lateral-raises',
  },

  pullups: {
    id: 'pullups',
    name: 'Pull-ups',
    category: 'pull',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'pull-ups',
  },
  'weighted-pullups': {
    id: 'weighted-pullups',
    name: 'Weighted Pull-ups',
    category: 'pull',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'weighted-pullups',
  },
  'barbell-curl': {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.3,
    muscleGroup: 'Biceps',
    libraryId: 'barbell-curl',
  },
  'dumbbell-curl': {
    id: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.25,
    muscleGroup: 'Biceps',
    libraryId: 'dumbbell-curl',
  },
  'hammer-curl': {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.25,
    muscleGroup: 'Biceps',
    libraryId: 'hammer-curl',
  },
  rows: {
    id: 'rows',
    name: 'Barbell Row',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.5,
    muscleGroup: 'Back',
    libraryId: 'barbell-row',
  },
  'dumbbell-row': {
    id: 'dumbbell-row',
    name: 'Dumbbell Row',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.4,
    muscleGroup: 'Back',
    libraryId: 'dumbbell-row',
  },
  'dumbbell-ohp': {
    id: 'dumbbell-ohp',
    name: 'Dumbbell Shoulder Press',
    category: 'push',
    baseLift: 'ohp',
    defaultPercentage: 0.5,
    muscleGroup: 'Shoulders',
    libraryId: 'dumbbell-shoulder-press',
  },
  'face-pulls': {
    id: 'face-pulls',
    name: 'Face Pulls',
    category: 'pull',
    baseLift: 'ohp',
    defaultPercentage: 0.2,
    muscleGroup: 'Shoulders',
    libraryId: 'face-pulls',
  },
  'lat-pulldowns': {
    id: 'lat-pulldowns',
    name: 'Lat Pulldown',
    category: 'pull',
    baseLift: 'deadlift',
    defaultPercentage: 0.5,
    muscleGroup: 'Back',
    libraryId: 'lat-pulldown',
  },
  'cable-rows': {
    id: 'cable-rows',
    name: 'Seated Cable Row',
    category: 'pull',
    baseLift: 'deadlift',
    defaultPercentage: 0.45,
    muscleGroup: 'Back',
    libraryId: 'seated-cable-row',
  },
  'inverted-rows': {
    id: 'inverted-rows',
    name: 'Inverted Rows',
    category: 'pull',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'inverted-rows',
  },

  lunges: {
    id: 'lunges',
    name: 'Walking Lunges',
    category: 'leg',
    baseLift: 'squat',
    defaultPercentage: 0.35,
    muscleGroup: 'Quads',
    libraryId: 'lunges',
  },
  'romanian-dl': {
    id: 'romanian-dl',
    name: 'Romanian Deadlift',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.65,
    muscleGroup: 'Hamstrings',
    libraryId: 'romanian-deadlift',
  },
  'leg-extensions': {
    id: 'leg-extensions',
    name: 'Leg Extension',
    category: 'leg',
    baseLift: 'squat',
    defaultPercentage: 0.35,
    muscleGroup: 'Quads',
    libraryId: 'leg-extension',
  },
  'leg-press': {
    id: 'leg-press',
    name: 'Leg Press',
    category: 'leg',
    baseLift: 'squat',
    defaultPercentage: 0.8,
    muscleGroup: 'Quads',
    libraryId: 'leg-press',
  },
  'leg-curls': {
    id: 'leg-curls',
    name: 'Leg Curl',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.3,
    muscleGroup: 'Hamstrings',
    libraryId: 'leg-curl',
  },
  'good-mornings': {
    id: 'good-mornings',
    name: 'Good Mornings',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.45,
    muscleGroup: 'Hamstrings',
    libraryId: 'good-mornings',
  },
  'box-jumps': {
    id: 'box-jumps',
    name: 'Box Jump',
    category: 'leg',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Other',
    libraryId: 'box-jump',
  },

  planks: {
    id: 'planks',
    name: 'Plank',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Core',
    libraryId: 'plank',
  },
  'hanging-leg-raises': {
    id: 'hanging-leg-raises',
    name: 'Hanging Leg Raise',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Core',
    libraryId: 'hanging-leg-raise',
  },
  'back-raises': {
    id: 'back-raises',
    name: 'Back Raises',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'back-raises',
  },
  hyperextensions: {
    id: 'hyperextensions',
    name: 'Hyperextensions',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'hyperextensions',
  },
  cableCrunch: {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Core',
    libraryId: 'cable-crunch',
  },
  'hip-thrust': {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.6,
    muscleGroup: 'Glutes',
    libraryId: 'hip-thrust',
  },
};

export function getLibraryIdForAccessory(accessoryId: string): string | null {
  return ACCESSORIES[accessoryId]?.libraryId || null;
}

export function calculateAccessoryWeight(
  accessoryId: string,
  oneRMs: OneRMValues,
  addedWeight = 0,
): number {
  const accessory = ACCESSORIES[accessoryId];
  if (!accessory) return 0;

  if (accessory.baseLift === null || accessory.defaultPercentage === null) {
    return addedWeight;
  }

  const baseLift1RM = oneRMs[accessory.baseLift as keyof OneRMValues];
  if (!baseLift1RM) return 0;

  const weight = baseLift1RM * accessory.defaultPercentage;
  return roundToPlate(weight);
}

export interface ParsedReps {
  numericValue: number;
  rawString: string;
}

export function parseReps(reps: number | string): ParsedReps {
  if (typeof reps === 'number') {
    return { numericValue: reps, rawString: String(reps) };
  }

  const timeMatch = reps.match(/(\d+)\s*sec/);
  if (timeMatch) {
    return {
      numericValue: parseInt(timeMatch[1]),
      rawString: reps,
    };
  }

  return { numericValue: 0, rawString: reps };
}

export function generateWorkoutAccessories(
  accessories: ProgramAccessory[],
  oneRMs: OneRMValues,
): WorkoutAccessory[] {
  return accessories.map((acc) => {
    const def = ACCESSORIES[acc.accessoryId];
    if (!def) {
      throw new Error(`Unknown accessory: ${acc.accessoryId}`);
    }

    return {
      accessoryId: acc.accessoryId,
      name: def.name,
      libraryId: def.libraryId,
      muscleGroup: def.muscleGroup,
      sets: acc.sets,
      reps: acc.reps,
      targetWeight: calculateAccessoryWeight(acc.accessoryId, oneRMs),
      addedWeight: 0,
      isRequired: acc.isRequired,
      isAmrap: typeof acc.reps === 'string' && acc.reps.trim().toUpperCase() === 'AMRAP',
    };
  });
}
