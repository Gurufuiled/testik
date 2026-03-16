/**
 * DatabaseService - initializes SQLite DB, runs schema, enables WAL and foreign_keys.
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, DB_VERSION } from '../db/schema';

const DB_NAME = 'messenger.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  let db = await SQLite.openDatabaseAsync(DB_NAME);

  // DB settings
  await db.execAsync('PRAGMA journal_mode=WAL;');
  await db.execAsync('PRAGMA foreign_keys=ON;');

  // Run migrations based on user_version
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < DB_VERSION) {
    // v1->v2: РїРѕР»РЅС‹Р№ СЃР±СЂРѕСЃ Р‘Р” (РёСЃРїСЂР°РІР»РµРЅРёРµ "no such column: id")
    if (currentVersion < 2) {
      await db.closeAsync();
      dbInstance = null;
      await SQLite.deleteDatabaseAsync(DB_NAME);
      db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode=WAL;');
      await db.execAsync('PRAGMA foreign_keys=ON;');
    }
    await db.execAsync(SCHEMA_SQL);
    await db.runAsync('PRAGMA user_version = ' + DB_VERSION);
  }

  dbInstance = db;
  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
}
