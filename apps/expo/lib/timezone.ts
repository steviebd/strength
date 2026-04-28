import { formatLocalDate, isValidTimeZone, resolveEffectiveTimezone } from '@strength/db/client';

export function getCurrentDeviceTimezone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && isValidTimeZone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

export function getActiveTimezone(
  profileTimezone: string | null | undefined,
  deviceTimezone?: string | null,
) {
  return resolveEffectiveTimezone(deviceTimezone, profileTimezone);
}

export function getTodayLocalDate(timezone?: string | null) {
  const resolvedTimezone = getActiveTimezone(timezone, getCurrentDeviceTimezone());
  if (!resolvedTimezone) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return formatLocalDate(new Date(), resolvedTimezone);
}
