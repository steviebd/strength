import type { SQLiteDatabase } from 'expo-sqlite';

export function runLocalMigrations(sqlite: SQLiteDatabase) {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS local_user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL,
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      timezone TEXT,
      bodyweight_kg REAL,
      weight_prompted_at INTEGER,
      server_updated_at INTEGER,
      local_updated_at INTEGER NOT NULL,
      hydrated_from_server_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_timezone_dismissals (
      user_id TEXT NOT NULL,
      device_timezone TEXT NOT NULL,
      dismissed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, device_timezone)
    );
  `);
}
