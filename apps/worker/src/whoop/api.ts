import { WHOOP_API_BASE } from './auth';

export interface WhoopProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface WhoopWorkout {
  id: string;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  score_state: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    percent_recorded?: number;
    distance_meter?: number | null;
    altitude_gain_meter?: number | null;
    altitude_change_meter?: number | null;
    zone_durations?: {
      zone_zero_milli?: number;
      zone_one_milli?: number;
      zone_two_milli?: number;
      zone_three_milli?: number;
      zone_four_milli?: number;
      zone_five_milli?: number;
    };
  };
  during?: unknown;
}

export interface WhoopRecovery {
  cycle_id?: number;
  sleep_id?: string;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  score_state?: string;
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
    respiratory_rate?: number;
    user_calibrating?: boolean;
  };
}

export interface WhoopCycle {
  id: string;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state?: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    percent_recorded?: number;
    distance_meter?: number | null;
    altitude_gain_meter?: number | null;
    altitude_change_meter?: number | null;
  };
}

export interface WhoopSleep {
  id: string;
  cycle_id?: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap?: boolean;
  score_state?: string;
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_no_data_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      sleep_cycle_count?: number;
      disturbance_count?: number;
    };
    sleep_needed?: {
      baseline_milli?: number;
      need_from_sleep_debt_milli?: number;
      need_from_recent_strain_milli?: number;
      need_from_recent_nap_milli?: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
}

export interface WhoopBodyMeasurement {
  id?: string;
  measurement_date?: string;
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate?: number;
}

type WhoopCollectionResponse<T> = {
  records?: T[];
  next_token?: string | null;
};

const WHOOP_COLLECTION_PAGE_LIMIT = 25;

async function fetchWhoopJson<T>(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${WHOOP_API_BASE}/${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    const err = new Error(
      `WHOOP API error for ${endpoint}: ${response.status} - ${error}`,
    ) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return (await response.json()) as T;
}

async function fetchWhoopCollection<T>(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string | number>,
): Promise<T[]> {
  const records: T[] = [];
  let nextToken: string | null | undefined;
  const baseParams = params ?? {};

  do {
    const pageParams: Record<string, string | number> = {
      limit: WHOOP_COLLECTION_PAGE_LIMIT,
      ...baseParams,
    };
    if (nextToken) {
      pageParams.nextToken = nextToken;
    }

    const page = await fetchWhoopJson<WhoopCollectionResponse<T>>(
      endpoint,
      accessToken,
      pageParams,
    );

    records.push(...(page.records ?? []));
    nextToken = page.next_token;
  } while (nextToken);

  return records;
}

export async function getWhoopProfile(accessToken: string): Promise<WhoopProfile> {
  return fetchWhoopJson<WhoopProfile>('user/profile/basic', accessToken);
}

export async function fetchWorkoutById(
  accessToken: string,
  workoutId: string,
): Promise<WhoopWorkout> {
  return fetchWhoopJson<WhoopWorkout>(`activity/workout/${workoutId}`, accessToken);
}

export async function fetchSleepById(accessToken: string, sleepId: string): Promise<WhoopSleep> {
  return fetchWhoopJson<WhoopSleep>(`activity/sleep/${sleepId}`, accessToken);
}

export async function fetchRecoveryByCycleId(
  accessToken: string,
  cycleId: number,
): Promise<WhoopRecovery> {
  return fetchWhoopJson<WhoopRecovery>(`cycle/${cycleId}/recovery`, accessToken);
}

export async function fetchCycleById(accessToken: string, cycleId: string): Promise<WhoopCycle> {
  return fetchWhoopJson<WhoopCycle>(`cycle/${cycleId}`, accessToken);
}

export async function fetchWorkouts(accessToken: string, start?: Date): Promise<WhoopWorkout[]> {
  return fetchWhoopCollection<WhoopWorkout>(
    'activity/workout',
    accessToken,
    start ? { start: start.toISOString() } : undefined,
  );
}

export async function fetchRecoveries(accessToken: string, start?: Date): Promise<WhoopRecovery[]> {
  return fetchWhoopCollection<WhoopRecovery>(
    'recovery',
    accessToken,
    start ? { start: start.toISOString() } : undefined,
  );
}

export async function fetchCycles(accessToken: string, start?: Date): Promise<WhoopCycle[]> {
  return fetchWhoopCollection<WhoopCycle>(
    'cycle',
    accessToken,
    start ? { start: start.toISOString() } : undefined,
  );
}

export async function fetchSleep(accessToken: string, start?: Date): Promise<WhoopSleep[]> {
  return fetchWhoopCollection<WhoopSleep>(
    'activity/sleep',
    accessToken,
    start ? { start: start.toISOString() } : undefined,
  );
}

export async function fetchBodyMeasurements(accessToken: string): Promise<WhoopBodyMeasurement[]> {
  const bodyMeasurement = await fetchWhoopJson<WhoopBodyMeasurement>(
    'user/measurement/body',
    accessToken,
  );
  return [bodyMeasurement];
}
