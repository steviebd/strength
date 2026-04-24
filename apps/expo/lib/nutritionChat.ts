export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export interface MealAnalysis {
  name: string;
  mealType?: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const VALID_MEAL_TYPES = new Set<MealType>(['Breakfast', 'Lunch', 'Dinner', 'Snack']);
const MACHINE_JSON_BLOCK_REGEX = /```(?:json)?\s*\n([\s\S]*?)\n```/gi;

function isMealType(value: unknown): value is MealType {
  return typeof value === 'string' && VALID_MEAL_TYPES.has(value as MealType);
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parseMealAnalysisFromContent(content: string): MealAnalysis | null {
  MACHINE_JSON_BLOCK_REGEX.lastIndex = 0;

  for (const match of content.matchAll(MACHINE_JSON_BLOCK_REGEX)) {
    const rawJson = match[1];
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.name !== 'string' ||
        !parsed.name.trim() ||
        typeof parsed.calories !== 'number' ||
        !Number.isFinite(parsed.calories)
      ) {
        continue;
      }

      return {
        name: parsed.name.trim(),
        ...(isMealType(parsed.mealType) && { mealType: parsed.mealType }),
        calories: parsed.calories,
        proteinG: toNumber(parsed.proteinG),
        carbsG: toNumber(parsed.carbsG),
        fatG: toNumber(parsed.fatG),
      };
    } catch {}
  }

  return null;
}

export function stripMachineJsonFromAssistantText(content: string): string {
  return content
    .replace(MACHINE_JSON_BLOCK_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getMealTypeFromHour(hour: number): MealType {
  if (hour >= 6 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 17 && hour < 22) return 'Dinner';
  return 'Snack';
}

function getNearestMealTypeForSnackHour(hour: number): MealType | null {
  if (hour < 6) return 'Breakfast';
  if (hour >= 10 && hour < 11) return 'Breakfast';
  if (hour >= 16 && hour < 17) return 'Dinner';
  if (hour >= 21 && hour < 24) return 'Dinner';
  return null;
}

export function resolveMealTypeForAnalysis(analysis: MealAnalysis, now = new Date()): MealType {
  const hour = now.getHours();
  const timeMealType = getMealTypeFromHour(hour);
  const baseMealType = analysis.mealType ?? timeMealType;

  if (analysis.calories < 250) {
    return 'Snack';
  }

  if (analysis.calories >= 450 && timeMealType === 'Snack') {
    return getNearestMealTypeForSnackHour(hour) ?? baseMealType;
  }

  return baseMealType;
}
