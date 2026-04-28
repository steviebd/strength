import { eq } from 'drizzle-orm';
import {
  getUtcRangeForLocalDate as getUtcRangeForLocalDateFromDb,
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

export function getUtcRangeForLocalDate(localDate: string, timeZone: string) {
  return getUtcRangeForLocalDateFromDb(localDate, timeZone);
}

export async function requireDateRange(
  c: any,
  db: any,
  userId: string,
  date: string,
): Promise<{ start: Date; end: Date; timezone: string } | Response> {
  const timezoneResult = await resolveUserTimezone(db, userId);
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }

  const { start, end } = getUtcRangeForLocalDate(date, timezoneResult.timezone);
  return { start, end, timezone: timezoneResult.timezone };
}
