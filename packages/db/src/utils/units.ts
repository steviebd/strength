export type WeightUnit = 'kg' | 'lbs';

export const KG_TO_LBS = 2.20462;
export const LBS_TO_KG = 0.453592;

export function convertToDisplayWeight(weightKg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? weightKg * KG_TO_LBS : weightKg;
}

export function convertToStorageWeight(weight: number, fromUnit: WeightUnit): number {
  return fromUnit === 'lbs' ? weight * LBS_TO_KG : weight;
}

export function formatWeight(weightKg: number, unit: WeightUnit): string {
  const display = convertToDisplayWeight(weightKg, unit);
  return `${display.toFixed(1)} ${unit}`;
}

export function getWeightIncrement(unit: WeightUnit): number {
  return unit === 'kg' ? 1.0 : 2.5;
}
