import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const localUserPreferences = sqliteTable('local_user_preferences', {
  userId: text('user_id').primaryKey(),
  weightUnit: text('weight_unit').notNull().default('kg'),
  timezone: text('timezone'),
  bodyweightKg: real('bodyweight_kg'),
  weightPromptedAt: integer('weight_prompted_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
  localUpdatedAt: integer('local_updated_at', { mode: 'timestamp_ms' }).notNull(),
  hydratedFromServerAt: integer('hydrated_from_server_at', { mode: 'timestamp_ms' }),
});

export const localTimezoneDismissals = sqliteTable(
  'local_timezone_dismissals',
  {
    userId: text('user_id').notNull(),
    deviceTimezone: text('device_timezone').notNull(),
    dismissedAt: integer('dismissed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deviceTimezone] })],
);

export type LocalUserPreferences = typeof localUserPreferences.$inferSelect;
