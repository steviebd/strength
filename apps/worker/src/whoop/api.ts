import { WHOOP_API_BASE } from './auth';

export interface WhoopProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface WhoopWorkout {
  id: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  score_state: string;
  score?: unknown;
  during?: unknown;
  zone_duration?: unknown;
}

export interface WhoopRecovery {
  id: string;
  cycle_id: string;
  date: string;
  recovery_score: number;
  hrv_rmssd_milli: number;
  hrv_rmssd_baseline: number;
  resting_heart_rate: number;
  resting_heart_rate_baseline: number;
  respiratory_rate: number;
  respiratory_rate_baseline: number;
  recovery_score_tier: 'low' | 'medium' | 'high';
  timezone_offset: string;
}

export interface WhoopCycle {
  id: string;
  start: string;
  end: string;
  timezone_offset: string;
  day_strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  kilojoule?: number;
  percent_recorded: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  altitude_change_meter?: number;
}

export interface WhoopSleep {
  id: string;
  start: string;
  end: string;
  timezone_offset: string;
  sleep_performance_percentage: number;
  total_sleep_time_milli: number;
  sleep_efficiency_percentage: number;
  slow_wave_sleep_time_milli: number;
  rem_sleep_time_milli: number;
  light_sleep_time_milli: number;
  wake_time_milli: number;
  arousal_time_milli: number;
  disturbance_count: number;
  sleep_latency_milli: number;
  sleep_consistency_percentage: number;
  sleep_need_baseline_milli: number;
  sleep_need_from_sleep_debt_milli: number;
  sleep_need_from_recent_strain_milli: number;
  sleep_need_from_recent_nap_milli: number;
  sleep_quality_tier: 'poor' | 'fair' | 'good' | 'excellent';
}

export interface WhoopBodyMeasurement {
  id: string;
  measurement_date: string;
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate?: number;
}

async function fetchWhoopApi<T>(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string | number>,
): Promise<T[]> {
  const url = new URL(`${WHOOP_API_BASE}/${endpoint}`);
  url.searchParams.set('limit', '25');

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

  const data = await response.json();
  if (Array.isArray(data)) {
    return data as T[];
  }
  return ((data as { records?: T[] }).records ?? []) as T[];
}

export async function getWhoopProfile(accessToken: string): Promise<WhoopProfile> {
  const response = await fetch(`${WHOOP_API_BASE}/user/profile/basic`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`WHOOP profile fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchWorkouts(accessToken: string, since?: Date): Promise<WhoopWorkout[]> {
  const params: Record<string, string | number> = {};
  if (since) {
    params.since = since.toISOString();
  }
  return fetchWhoopApi<WhoopWorkout>('activity/workout', accessToken, params);
}

export async function fetchRecoveries(accessToken: string, since?: Date): Promise<WhoopRecovery[]> {
  const params: Record<string, string | number> = {};
  if (since) {
    params.since = since.toISOString();
  }
  return fetchWhoopApi<WhoopRecovery>('recovery', accessToken, params);
}

export async function fetchCycles(accessToken: string, since?: Date): Promise<WhoopCycle[]> {
  const params: Record<string, string | number> = {};
  if (since) {
    params.since = since.toISOString();
  }
  return fetchWhoopApi<WhoopCycle>('cycle', accessToken, params);
}

export async function fetchSleep(accessToken: string, since?: Date): Promise<WhoopSleep[]> {
  const params: Record<string, string | number> = {};
  if (since) {
    params.since = since.toISOString();
  }
  return fetchWhoopApi<WhoopSleep>('activity/sleep', accessToken, params);
}

export async function fetchBodyMeasurements(accessToken: string): Promise<WhoopBodyMeasurement[]> {
  return fetchWhoopApi<WhoopBodyMeasurement>('user/measurement/body', accessToken);
}
