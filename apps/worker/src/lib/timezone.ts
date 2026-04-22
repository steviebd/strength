import { eq } from 'drizzle-orm';
import {
  formatLocalDate,
  getUtcRangeForLocalDate,
  isValidTimeZone,
  resolveEffectiveTimezone,
} from '@strength/db';
import * as schema from '@strength/db';

export async function getStoredUserTimezone(db: any, userId: string) {
  const preferences = await db
    .select({ timezone: schema.userPreferences.timezone })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .get();

  return preferences?.timezone && isValidTimeZone(preferences.timezone)
    ? preferences.timezone
    : null;
}

export async function resolveUserTimezone(
  db: any,
  userId: string,
  requestedTimezone?: string | null,
) {
  if (requestedTimezone && !isValidTimeZone(requestedTimezone)) {
    return { timezone: null, error: 'Invalid timezone' as const };
  }

  const storedTimezone = await getStoredUserTimezone(db, userId);
  const timezone = resolveEffectiveTimezone(requestedTimezone, storedTimezone);

  if (!timezone) {
    return { timezone: null, error: 'Timezone is required' as const };
  }

  return { timezone, error: null };
}

export function buildLocalDateRecord(
  instant: Date,
  timeZone: string,
  prefix: 'started' | 'completed',
) {
  return {
    [`${prefix}At`]: instant,
    [`${prefix}Timezone`]: timeZone,
    [`${prefix}LocalDate`]: formatLocalDate(instant, timeZone),
  };
}

export function buildCompletedSetRecord(instant: Date, timeZone: string) {
  return {
    completedAt: instant,
    completedTimezone: timeZone,
    completedLocalDate: formatLocalDate(instant, timeZone),
  };
}

export function getDateRangeForTimezone(localDate: string, timeZone: string) {
  return getUtcRangeForLocalDate(localDate, timeZone);
}
