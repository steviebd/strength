export const METERS_PER_MILE = 1609.344;
export const CM_PER_INCH = 2.54;

export type WeightUnit = 'kg' | 'lbs';
export type DistanceUnit = 'km' | 'mi';
export type HeightUnit = 'cm' | 'in';

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (unit === 'km') {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }
  // unit === 'mi'
  if (meters < METERS_PER_MILE) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / METERS_PER_MILE).toFixed(1)} mi`;
}

export function formatHeight(cm: number, unit: HeightUnit): string {
  if (unit === 'cm') {
    return `${Math.round(cm)} cm`;
  }
  const inches = cm / CM_PER_INCH;
  return `${Math.round(inches)} in`;
}

export const LBS_TO_KG = 0.453592;
export const KG_TO_LBS = 2.20462;

export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * KG_TO_LBS;
}

export function toStorageWeight(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * LBS_TO_KG;
}

export function parseDistanceInput(value: number, unit: DistanceUnit): number {
  if (unit === 'km') {
    return value * 1000;
  }
  return value * METERS_PER_MILE;
}

export function parseHeightInput(value: number, unit: HeightUnit): number {
  if (unit === 'cm') {
    return value;
  }
  return value * CM_PER_INCH;
}

export function toDisplayHeight(cm: number, unit: HeightUnit): number {
  return unit === 'cm' ? cm : cm / CM_PER_INCH;
}

export function toStorageHeight(value: number, unit: HeightUnit): number {
  return unit === 'cm' ? value : value * CM_PER_INCH;
}
