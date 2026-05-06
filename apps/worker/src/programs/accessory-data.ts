import { roundToPlate } from './utils';
import { getExerciseTypeByLibraryId } from '@strength/db/exercise-library';
import type { AccessoryDefinition, ProgramAccessory, WorkoutAccessory, OneRMValues } from './types';

const ACCESSORIES: Record<string, AccessoryDefinition> = {
  dips: {
    id: 'dips',
    name: 'Dips',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.5,
    muscleGroup: 'Chest',
    libraryId: 'chest-dips',
    exerciseType: 'bodyweight',
  },
  'weighted-dips': {
    id: 'weighted-dips',
    name: 'Weighted Dips',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.5,
    muscleGroup: 'Chest',
    libraryId: 'weighted-dips',
    exerciseType: 'weighted',
  },
  pushups: {
    id: 'pushups',
    name: 'Push-ups',
    category: 'push',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Chest',
    libraryId: 'push-ups',
    exerciseType: 'bodyweight',
  },
  skullcrushers: {
    id: 'skullcrushers',
    name: 'Skull Crushers',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.35,
    muscleGroup: 'Triceps',
    libraryId: 'skull-crushers',
    exerciseType: 'weighted',
  },
  'tricep-pushdowns': {
    id: 'tricep-pushdowns',
    name: 'Tricep Pushdowns',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.25,
    muscleGroup: 'Triceps',
    libraryId: 'tricep-pushdown',
    exerciseType: 'weighted',
  },
  'tricep-extensions': {
    id: 'tricep-extensions',
    name: 'Overhead Tricep Extension',
    category: 'push',
    baseLift: 'bench',
    defaultPercentage: 0.3,
    muscleGroup: 'Triceps',
    libraryId: 'overhead-tricep-extension',
    exerciseType: 'weighted',
  },
  'lateral-raises': {
    id: 'lateral-raises',
    name: 'Lateral Raises',
    category: 'push',
    baseLift: 'ohp',
    defaultPercentage: 0.15,
    muscleGroup: 'Shoulders',
    libraryId: 'lateral-raises',
    exerciseType: 'weighted',
  },

  pullups: {
    id: 'pullups',
    name: 'Pull-ups',
    category: 'pull',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'pull-ups',
    exerciseType: 'bodyweight',
  },
  'weighted-pullups': {
    id: 'weighted-pullups',
    name: 'Weighted Pull-ups',
    category: 'pull',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'weighted-pullups',
    exerciseType: 'weighted',
  },
  'barbell-curl': {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.3,
    muscleGroup: 'Biceps',
    libraryId: 'barbell-curl',
    exerciseType: 'weighted',
  },
  'dumbbell-curl': {
    id: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.25,
    muscleGroup: 'Biceps',
    libraryId: 'dumbbell-curl',
    exerciseType: 'weighted',
  },
  'hammer-curl': {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.25,
    muscleGroup: 'Biceps',
    libraryId: 'hammer-curl',
    exerciseType: 'weighted',
  },
  rows: {
    id: 'rows',
    name: 'Barbell Row',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.5,
    muscleGroup: 'Back',
    libraryId: 'barbell-row',
    exerciseType: 'weighted',
  },
  'dumbbell-row': {
    id: 'dumbbell-row',
    name: 'Dumbbell Row',
    category: 'pull',
    baseLift: 'bench',
    defaultPercentage: 0.4,
    muscleGroup: 'Back',
    libraryId: 'dumbbell-row',
    exerciseType: 'weighted',
  },
  'dumbbell-ohp': {
    id: 'dumbbell-ohp',
    name: 'Dumbbell Shoulder Press',
    category: 'push',
    baseLift: 'ohp',
    defaultPercentage: 0.5,
    muscleGroup: 'Shoulders',
    libraryId: 'dumbbell-shoulder-press',
    exerciseType: 'weighted',
  },
  'face-pulls': {
    id: 'face-pulls',
    name: 'Face Pulls',
    category: 'pull',
    baseLift: 'ohp',
    defaultPercentage: 0.2,
    muscleGroup: 'Shoulders',
    libraryId: 'face-pulls',
    exerciseType: 'weighted',
  },
  'lat-pulldowns': {
    id: 'lat-pulldowns',
    name: 'Lat Pulldowns',
    category: 'pull',
    baseLift: 'deadlift',
    defaultPercentage: 0.5,
    muscleGroup: 'Back',
    libraryId: 'lat-pulldown',
    exerciseType: 'weighted',
  },
  'cable-rows': {
    id: 'cable-rows',
    name: 'Seated Cable Row',
    category: 'pull',
    baseLift: 'deadlift',
    defaultPercentage: 0.45,
    muscleGroup: 'Back',
    libraryId: 'seated-cable-row',
    exerciseType: 'weighted',
  },
  'inverted-rows': {
    id: 'inverted-rows',
    name: 'Inverted Rows',
    category: 'pull',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'inverted-rows',
    exerciseType: 'bodyweight',
  },

  lunges: {
    id: 'lunges',
    name: 'Walking Lunges',
    category: 'leg',
    baseLift: 'squat',
    defaultPercentage: 0.35,
    muscleGroup: 'Quads',
    libraryId: 'lunges',
    exerciseType: 'weighted',
  },
  'romanian-dl': {
    id: 'romanian-dl',
    name: 'Romanian Deadlift',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.65,
    muscleGroup: 'Hamstrings',
    libraryId: 'romanian-deadlift',
    exerciseType: 'weighted',
  },
  'leg-extensions': {
    id: 'leg-extensions',
    name: 'Leg Extensions',
    category: 'leg',
    baseLift: 'squat',
    defaultPercentage: 0.35,
    muscleGroup: 'Quads',
    libraryId: 'leg-extension',
    exerciseType: 'weighted',
  },
  'leg-press': {
    id: 'leg-press',
    name: 'Leg Press',
    category: 'leg',
    baseLift: 'squat',
    defaultPercentage: 0.8,
    muscleGroup: 'Quads',
    libraryId: 'leg-press',
    exerciseType: 'weighted',
  },
  'leg-curls': {
    id: 'leg-curls',
    name: 'Leg Curls',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.3,
    muscleGroup: 'Hamstrings',
    libraryId: 'leg-curl',
    exerciseType: 'weighted',
  },
  'good-mornings': {
    id: 'good-mornings',
    name: 'Good Mornings',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.45,
    muscleGroup: 'Hamstrings',
    libraryId: 'good-mornings',
    exerciseType: 'weighted',
  },
  'box-jumps': {
    id: 'box-jumps',
    name: 'Box Jumps',
    category: 'leg',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Other',
    libraryId: 'box-jump',
    exerciseType: 'plyo',
  },

  planks: {
    id: 'planks',
    name: 'Plank',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Core',
    libraryId: 'plank',
    exerciseType: 'timed',
  },
  'hanging-leg-raises': {
    id: 'hanging-leg-raises',
    name: 'Hanging Leg Raise',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Core',
    libraryId: 'hanging-leg-raise',
    exerciseType: 'weighted',
  },
  'back-raises': {
    id: 'back-raises',
    name: 'Back Raises',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'back-raises',
    exerciseType: 'weighted',
  },
  hyperextensions: {
    id: 'hyperextensions',
    name: 'Hyperextensions',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Back',
    libraryId: 'hyperextensions',
    exerciseType: 'weighted',
  },
  cableCrunch: {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    category: 'core',
    baseLift: null,
    defaultPercentage: null,
    muscleGroup: 'Core',
    libraryId: 'cable-crunch',
    exerciseType: 'weighted',
  },
  'hip-thrust': {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    category: 'leg',
    baseLift: 'deadlift',
    defaultPercentage: 0.6,
    muscleGroup: 'Glutes',
    libraryId: 'hip-thrust',
    exerciseType: 'weighted',
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

    const parsed = parseReps(acc.reps);
    const exerciseType = getExerciseTypeByLibraryId(def.libraryId);
    const targetDuration = exerciseType === 'timed' ? parsed.numericValue : undefined;

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
      exerciseType,
      ...(targetDuration !== undefined && { targetDuration }),
      ...(exerciseType === 'plyo' && { targetHeight: 60 }),
    };
  });
}
