function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

const timestampKeys = new Set([
  'date',
  'start',
  'end',
  'createdAt',
  'updatedAt',
  'webhookReceivedAt',
]);

const numericKeys = new Set([
  'recoveryScore',
  'hrvRmssdMilli',
  'hrvRmssdBaseline',
  'restingHeartRate',
  'restingHeartRateBaseline',
  'respiratoryRate',
  'respiratoryRateBaseline',
  'sleepPerformancePercentage',
  'totalSleepTimeMilli',
  'sleepEfficiencyPercentage',
  'slowWaveSleepTimeMilli',
  'remSleepTimeMilli',
  'lightSleepTimeMilli',
  'wakeTimeMilli',
  'disturbanceCount',
  'respiratoryRate',
  'dayStrain',
  'averageHeartRate',
  'maxHeartRate',
  'kilojoule',
]);

function normalizeTimestamp(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return value;
}

function normalizeNumber(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}

function transformRecord<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    if (timestampKeys.has(camelKey)) {
      result[camelKey] = normalizeTimestamp(value);
    } else if (numericKeys.has(camelKey)) {
      result[camelKey] = normalizeNumber(value);
    } else if (value instanceof Date) {
      result[camelKey] = value.getTime();
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[camelKey] = transformRecord(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }
  return result as T;
}

export interface WhoopRecovery {
  id: string;
  date: number;
  recoveryScore: number | null;
  hrvRmssdMilli: number | null;
  hrvRmssdBaseline: number | null;
  restingHeartRate: number | null;
  restingHeartRateBaseline: number | null;
  respiratoryRate: number | null;
  respiratoryRateBaseline: number | null;
  recoveryScoreTier: string | null;
}

export interface WhoopSleep {
  id: string;
  start: number;
  end: number;
  sleepPerformancePercentage: number | null;
  totalSleepTimeMilli: number | null;
  sleepEfficiencyPercentage: number | null;
  slowWaveSleepTimeMilli: number | null;
  remSleepTimeMilli: number | null;
  lightSleepTimeMilli: number | null;
  wakeTimeMilli: number | null;
  disturbanceCount?: number | null;
  respiratoryRate?: number | null;
  sleepQualityTier: string | null;
}

export interface WhoopCycle {
  id: string;
  start: number;
  end: number;
  dayStrain: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  kilojoule: number | null;
}

export interface WhoopWorkout {
  id: string;
  start: number;
  end: number;
  sportName: string | null;
  scoreState: string | null;
  score: string | null;
  strain?: number | null;
  averageHeartRate?: number | null;
  maxHeartRate?: number | null;
  kilojoule?: number | null;
  caloriesKcal?: number | null;
}

export interface WhoopData {
  recovery: WhoopRecovery[];
  sleep: WhoopSleep[];
  cycles: WhoopCycle[];
  workouts: WhoopWorkout[];
}

export function transformWhoopData(raw: {
  recovery: Record<string, unknown>[];
  sleep: Record<string, unknown>[];
  cycles: Record<string, unknown>[];
  workouts: Record<string, unknown>[];
}): WhoopData {
  return {
    recovery: raw.recovery.map((r) => transformRecord(r) as unknown as WhoopRecovery),
    sleep: raw.sleep.map((s) => transformRecord(s) as unknown as WhoopSleep),
    cycles: raw.cycles.map((c) => transformRecord(c) as unknown as WhoopCycle),
    workouts: raw.workouts.map((w) => transformRecord(w) as unknown as WhoopWorkout),
  };
}
