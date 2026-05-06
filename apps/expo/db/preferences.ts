import { and, eq } from 'drizzle-orm';
import { getLocalDb } from './client';
import {
  localTimezoneDismissals,
  localUserPreferences,
  type LocalUserPreferences,
} from './local-schema';
import type { DistanceUnit } from '@/lib/units';

export type WeightUnit = 'kg' | 'lbs';

export interface LocalPreferencePatch {
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  timezone?: string | null;
  bodyweightKg?: number | null;
  weightPromptedAt?: Date | null;
  serverUpdatedAt?: Date | null;
  hydratedFromServerAt?: Date | null;
}

export async function getLocalPreferences(userId: string) {
  const db = getLocalDb();
  if (!db) {
    return null;
  }

  return (
    db.select().from(localUserPreferences).where(eq(localUserPreferences.userId, userId)).get() ??
    null
  );
}

export async function upsertLocalPreferences(userId: string, patch: LocalPreferencePatch) {
  const db = getLocalDb();
  if (!db) {
    return null;
  }

  const existing = await getLocalPreferences(userId);
  const now = new Date();
  const next: LocalUserPreferences = {
    userId,
    weightUnit: patch.weightUnit ?? (existing?.weightUnit as WeightUnit | undefined) ?? 'kg',
    distanceUnit:
      patch.distanceUnit ?? (existing?.distanceUnit as DistanceUnit | undefined) ?? 'km',
    timezone: patch.timezone !== undefined ? patch.timezone : (existing?.timezone ?? null),
    bodyweightKg:
      patch.bodyweightKg !== undefined ? patch.bodyweightKg : (existing?.bodyweightKg ?? null),
    weightPromptedAt:
      patch.weightPromptedAt !== undefined
        ? patch.weightPromptedAt
        : (existing?.weightPromptedAt ?? null),
    serverUpdatedAt:
      patch.serverUpdatedAt !== undefined
        ? patch.serverUpdatedAt
        : (existing?.serverUpdatedAt ?? null),
    localUpdatedAt: now,
    hydratedFromServerAt:
      patch.hydratedFromServerAt !== undefined
        ? patch.hydratedFromServerAt
        : (existing?.hydratedFromServerAt ?? null),
  };

  db.insert(localUserPreferences)
    .values(next)
    .onConflictDoUpdate({
      target: localUserPreferences.userId,
      set: next,
    })
    .run();

  return next;
}

export async function hasDismissedTimezone(userId: string, deviceTimezone: string) {
  const db = getLocalDb();
  if (!db) {
    return false;
  }

  const dismissal = db
    .select()
    .from(localTimezoneDismissals)
    .where(
      and(
        eq(localTimezoneDismissals.userId, userId),
        eq(localTimezoneDismissals.deviceTimezone, deviceTimezone),
      ),
    )
    .get();

  return Boolean(dismissal);
}

export async function dismissTimezone(userId: string, deviceTimezone: string) {
  const db = getLocalDb();
  if (!db) {
    return;
  }

  db.insert(localTimezoneDismissals)
    .values({ userId, deviceTimezone, dismissedAt: new Date() })
    .onConflictDoUpdate({
      target: [localTimezoneDismissals.userId, localTimezoneDismissals.deviceTimezone],
      set: { dismissedAt: new Date() },
    })
    .run();
}

export async function clearTimezoneDismissals(userId: string) {
  const db = getLocalDb();
  if (!db) {
    return;
  }

  db.delete(localTimezoneDismissals).where(eq(localTimezoneDismissals.userId, userId)).run();
}
