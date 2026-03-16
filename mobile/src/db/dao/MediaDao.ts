/**
 * MediaDao - CRUD operations for media table.
 * Waveform stored as BLOB (JSON string UTF-8 bytes). Parsed to number[] when reading.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MediaRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

function waveformToBlob(waveform: MediaRow['waveform']): Uint8Array | null {
  if (waveform == null) return null;
  if (waveform instanceof Uint8Array) return waveform;
  return new TextEncoder().encode(JSON.stringify(waveform));
}

function parseWaveformBlob(blob: unknown): number[] | null {
  if (blob == null) return null;
  const bytes =
    blob instanceof Uint8Array
      ? blob
      : blob instanceof ArrayBuffer
        ? new Uint8Array(blob)
        : new Uint8Array(0);
  if (bytes.length === 0) return null;
  try {
    const str = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(str) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

function mapMediaRow<T extends { waveform?: unknown }>(row: T): T & { waveform: number[] | null } {
  return {
    ...row,
    waveform: parseWaveformBlob(row.waveform),
  } as T & { waveform: number[] | null };
}

export class MediaDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async insert(row: MediaRow): Promise<void> {
    const waveformBlob = waveformToBlob(row.waveform);
    await this.db.runAsync(
      `INSERT INTO media (id, message_id, media_type, file_name, mime_type, file_size, width, height, duration_ms, local_path, remote_url, thumbnail_path, waveform, is_round, is_viewed, is_played, playback_pos_ms, upload_status, upload_progress, temp_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.message_id ?? null,
      row.media_type,
      row.file_name ?? null,
      row.mime_type ?? null,
      row.file_size ?? null,
      row.width ?? null,
      row.height ?? null,
      row.duration_ms ?? null,
      row.local_path ?? null,
      row.remote_url ?? null,
      row.thumbnail_path ?? null,
      waveformBlob,
      row.is_round ?? 0,
      row.is_viewed ?? 0,
      row.is_played ?? 0,
      row.playback_pos_ms ?? 0,
      row.upload_status ?? 'pending',
      row.upload_progress ?? 0,
      row.temp_path ?? null,
      row.created_at
    );
  }

  async getById(id: string): Promise<MediaRow | null> {
    const row = await this.db.getFirstAsync<MediaRow>(
      'SELECT * FROM media WHERE id = ?',
      id
    );
    return row ? mapMediaRow(row) : null;
  }

  async getByMessageId(messageId: string): Promise<MediaRow[]> {
    const rows = await this.db.getAllAsync<MediaRow>(
      'SELECT * FROM media WHERE message_id = ?',
      messageId
    );
    return rows.map(mapMediaRow);
  }

  async update(row: Partial<MediaRow> & { id: string }): Promise<void> {
    const existing = await this.getById(row.id);
    if (!existing) return;

    const updates: string[] = [];
    const values: unknown[] = [];

    const fields = [
      'message_id', 'media_type', 'file_name', 'mime_type', 'file_size',
      'width', 'height', 'duration_ms', 'local_path', 'remote_url',
      'thumbnail_path', 'waveform', 'is_round', 'is_viewed', 'is_played',
      'playback_pos_ms', 'upload_status', 'upload_progress', 'temp_path',
      'created_at'
    ] as const;
    for (const f of fields) {
      if (row[f] !== undefined) {
        updates.push(`${f} = ?`);
        const val =
          f === 'waveform'
            ? waveformToBlob(row.waveform ?? null)
            : (row[f] ?? null);
        values.push(val);
      }
    }
    if (updates.length === 0) return;

    values.push(row.id);
    await this.db.runAsync(
      `UPDATE media SET ${updates.join(', ')} WHERE id = ?`,
      values as (string | number | Uint8Array | null)[]
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM media WHERE id = ?', id);
  }

  async getPendingUploads(): Promise<MediaRow[]> {
    return this.db.getAllAsync<MediaRow>(
      "SELECT * FROM media WHERE upload_status != 'done'"
    );
  }
}
