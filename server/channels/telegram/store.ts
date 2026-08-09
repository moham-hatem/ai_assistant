import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AnswerLanguage } from '../../domain.ts';

export type UpdateClaim = 'claimed' | 'busy' | 'completed';

const schema = `
  CREATE TABLE IF NOT EXISTS telegram_sessions (
    session_key TEXT PRIMARY KEY,
    language TEXT CHECK (language IN ('ar', 'en', 'sw') OR language IS NULL),
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS telegram_updates (
    update_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
    lease_until INTEGER,
    attempts INTEGER NOT NULL CHECK (attempts >= 1),
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS telegram_updates_lease_idx
    ON telegram_updates (status, lease_until);
`;

export class TelegramStore {
  private readonly database: DatabaseSync;
  private readonly now: () => number;
  private readonly sessionSecret: string;

  constructor(
    path: string,
    sessionSecret: string,
    now: () => number = Date.now,
  ) {
    this.sessionSecret = sessionSecret;
    this.now = now;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    migrate(this.database);
  }

  sessionKey(chatId: number): string {
    return createHmac('sha256', this.sessionSecret).update(String(chatId)).digest('hex');
  }

  getLanguage(sessionKey: string): AnswerLanguage | undefined {
    const row = this.database.prepare(
      'SELECT language FROM telegram_sessions WHERE session_key = ?',
    ).get(sessionKey) as unknown as { language: AnswerLanguage | null } | undefined;
    return row?.language ?? undefined;
  }

  setLanguage(sessionKey: string, language: AnswerLanguage): void {
    this.database.prepare(`
      INSERT INTO telegram_sessions (session_key, language, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET language = excluded.language, updated_at = excluded.updated_at
    `).run(sessionKey, language, this.now());
  }

  ensureSession(sessionKey: string): void {
    this.database.prepare(`
      INSERT INTO telegram_sessions (session_key, language, updated_at)
      VALUES (?, NULL, ?)
      ON CONFLICT(session_key) DO UPDATE SET updated_at = excluded.updated_at
    `).run(sessionKey, this.now());
  }

  claimUpdate(updateId: number, leaseMs: number): UpdateClaim {
    return transaction(this.database, () => {
      const now = this.now();
      const row = this.database.prepare(
        'SELECT status, lease_until FROM telegram_updates WHERE update_id = ?',
      ).get(updateId) as unknown as { lease_until: number | null; status: string } | undefined;
      if (!row) {
        this.database.prepare(`
          INSERT INTO telegram_updates (update_id, status, lease_until, attempts, updated_at)
          VALUES (?, 'processing', ?, 1, ?)
        `).run(updateId, now + leaseMs, now);
        return 'claimed';
      }
      if (row.status === 'completed') return 'completed';
      if ((row.lease_until ?? 0) > now) return 'busy';
      this.database.prepare(`
        UPDATE telegram_updates
        SET lease_until = ?, attempts = attempts + 1, updated_at = ?
        WHERE update_id = ?
      `).run(now + leaseMs, now, updateId);
      return 'claimed';
    });
  }

  completeUpdate(updateId: number): void {
    this.database.prepare(`
      UPDATE telegram_updates
      SET status = 'completed', lease_until = NULL, updated_at = ?
      WHERE update_id = ? AND status = 'processing'
    `).run(this.now(), updateId);
  }

  releaseUpdate(updateId: number): void {
    this.database.prepare(`
      UPDATE telegram_updates SET lease_until = 0, updated_at = ?
      WHERE update_id = ? AND status = 'processing'
    `).run(this.now(), updateId);
  }

  close(): void {
    this.database.close();
  }
}

function migrate(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as unknown as { user_version: number };
  if (row.user_version > 1) throw new Error('Telegram database version is newer than supported');
  if (row.user_version === 1) {
    database.exec(schema);
    return;
  }
  database.exec('BEGIN IMMEDIATE;');
  try {
    database.exec(schema);
    database.exec('PRAGMA user_version = 1;');
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = operation();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}
