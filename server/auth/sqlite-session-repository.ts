import type { DatabaseSync } from 'node:sqlite';
import type { AuthSession } from './domain.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import { enqueueSecurityAudit } from '../modules/security-audit/sqlite-outbox.ts';
import { withImmediateTransaction } from './sqlite-transaction.ts';

interface SessionRow {
  absolute_expires_at: string;
  created_at: string;
  idle_expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  token_hash: string;
  user_id: string;
}

export class SqliteSessionRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async save(session: AuthSession, audit?: SecurityAuditCommand): Promise<void> {
    withImmediateTransaction(this.database, () => {
      this.insert(session);
      if (audit) enqueueSecurityAudit(this.database, audit);
    });
  }

  async rotate(
    previousTokenHash: string | undefined,
    session: AuthSession,
    audit: readonly SecurityAuditCommand[] = [],
  ): Promise<void> {
    withImmediateTransaction(this.database, () => {
      if (previousTokenHash) {
        this.database.prepare(`
          UPDATE auth_sessions SET revoked_at = ?
          WHERE token_hash = ? AND revoked_at IS NULL
        `).run(session.createdAt, previousTokenHash);
      }
      this.insert(session);
      for (const event of audit) enqueueSecurityAudit(this.database, event);
    });
  }

  private insert(session: AuthSession): void {
    this.database.prepare(`
      INSERT INTO auth_sessions (
        token_hash, user_id, created_at, last_seen_at, idle_expires_at,
        absolute_expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.tokenHash,
      session.userId,
      session.createdAt,
      session.lastSeenAt,
      session.idleExpiresAt,
      session.absoluteExpiresAt,
      session.revokedAt,
    );
  }

  async find(tokenHash: string): Promise<AuthSession | undefined> {
    const row = this.database.prepare(
      'SELECT * FROM auth_sessions WHERE token_hash = ?',
    ).get(tokenHash) as unknown as SessionRow | undefined;
    return row ? {
      absoluteExpiresAt: row.absolute_expires_at,
      createdAt: row.created_at,
      idleExpiresAt: row.idle_expires_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
      tokenHash: row.token_hash,
      userId: row.user_id,
    } : undefined;
  }

  async touch(tokenHash: string, lastSeenAt: string, idleExpiresAt: string): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE auth_sessions SET last_seen_at = ?, idle_expires_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL
        AND idle_expires_at > ? AND absolute_expires_at > ?
    `).run(lastSeenAt, idleExpiresAt, tokenHash, lastSeenAt, lastSeenAt);
    return result.changes === 1;
  }

  async revoke(
    tokenHash: string,
    revokedAt: string,
    audit?: SecurityAuditCommand,
  ): Promise<boolean> {
    return withImmediateTransaction(this.database, () => {
      const result = this.database.prepare(`
        UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL
      `).run(revokedAt, tokenHash);
      if (audit && result.changes === 1) enqueueSecurityAudit(this.database, audit);
      return result.changes === 1;
    });
  }

  async revokeAll(
    userId: string,
    revokedAt: string,
    audit?: SecurityAuditCommand,
  ): Promise<number> {
    return withImmediateTransaction(this.database, () => {
      const result = this.database.prepare(`
        UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
      `).run(revokedAt, userId);
      if (audit && result.changes > 0) enqueueSecurityAudit(this.database, audit);
      return Number(result.changes);
    });
  }
}
