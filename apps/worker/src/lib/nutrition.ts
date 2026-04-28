import type { MacroTargets } from './ai/nutrition-prompts';

export function calculateMacroTargets(
  bodyweightKg: number,
  trainingType: string | null,
  fallbackCalories: number,
  customTargets?: {
    targetCalories?: number;
    targetProteinG?: number;
    targetCarbsG?: number;
    targetFatG?: number;
  },
): MacroTargets {
  if (customTargets?.targetCalories) {
    return {
      calories: customTargets.targetCalories,
      proteinG: customTargets.targetProteinG ?? Math.round(bodyweightKg * 2),
      carbsG: customTargets.targetCarbsG ?? Math.round(bodyweightKg * 3),
      fatG: customTargets.targetFatG ?? Math.round(bodyweightKg * 0.8),
    };
  }

  const proteinG = Math.round(bodyweightKg * 2);
  const fatG = Math.round(bodyweightKg * 0.8);
  const proteinCals = proteinG * 4;
  const fatCals = fatG * 9;
  const remainingCals = fallbackCalories - proteinCals - fatCals;
  const carbsG = Math.max(0, Math.round(remainingCals / 4));

  let multiplier = 1;
  if (trainingType === 'powerlifting') {
    multiplier = 1.1;
  } else if (trainingType === 'cardio') {
    multiplier = 1.05;
  } else if (trainingType === 'rest_day') {
    multiplier = 0.95;
  }

  return {
    calories: Math.round(fallbackCalories * multiplier),
    proteinG,
    carbsG,
    fatG,
  };
}
