import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { runLocalMigrations } from './migrations';
import * as schema from './local-schema';

let sqliteClient: SQLiteDatabase | null | undefined;
let drizzleClient: ReturnType<typeof drizzle<typeof schema>> | null | undefined;

function openLocalSqlite() {
  if (sqliteClient !== undefined) {
    return sqliteClient;
  }

  try {
    const sqlite = openDatabaseSync('strength-local.db');
    runLocalMigrations(sqlite);
    sqliteClient = sqlite;
  } catch {
    sqliteClient = null;
  }

  return sqliteClient;
}

export function getLocalDb() {
  if (drizzleClient !== undefined) {
    return drizzleClient;
  }

  const sqlite = openLocalSqlite();
  drizzleClient = sqlite ? drizzle(sqlite, { schema }) : null;
  return drizzleClient;
}
