/**
 * AuthSessionDao - CRUD for auth_session table (single row, id=1).
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { AuthSessionRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

const SESSION_ID = 1;

export class AuthSessionDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async insert(row: Omit<AuthSessionRow, 'id'>): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO auth_session (id, user_id, access_token, refresh_token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      SESSION_ID,
      row.user_id ?? null,
      row.access_token ?? null,
      row.refresh_token ?? null,
      row.expires_at ?? null,
      row.created_at
    );
  }

  async get(): Promise<AuthSessionRow | null> {
    const row = await this.db.getFirstAsync<AuthSessionRow>(
      'SELECT * FROM auth_session WHERE id = ?',
      SESSION_ID
    );
    return row ?? null;
  }

  async update(row: Partial<Omit<AuthSessionRow, 'id'>>): Promise<void> {
    const existing = await this.get();
    if (!existing) return;

    const updates: string[] = [];
    const values: unknown[] = [];

    const fields = ['user_id', 'access_token', 'refresh_token', 'expires_at', 'created_at'] as const;
    for (const f of fields) {
      if (row[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(row[f] ?? null);
      }
    }
    if (updates.length === 0) return;

    values.push(SESSION_ID);
    await this.db.runAsync(
      `UPDATE auth_session SET ${updates.join(', ')} WHERE id = ?`,
      values as (string | number | null)[]
    );
  }

  async clear(): Promise<void> {
    await this.db.runAsync(
      `UPDATE auth_session SET user_id = NULL, access_token = NULL, refresh_token = NULL, expires_at = NULL, created_at = 0 WHERE id = ?`,
      SESSION_ID
    );
  }
}
