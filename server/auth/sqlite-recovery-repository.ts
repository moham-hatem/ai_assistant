import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../errors.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import { enqueueSecurityAudit } from '../modules/security-audit/sqlite-outbox.ts';
import {
  AccessUserNotFoundError,
  type CreateRecoveryRecord,
  type RecoveryIssueMutationResult,
} from './access-repository.ts';
import type { AuthRecovery, AuthUser } from './domain.ts';
import { SqliteAuthUserReader } from './sqlite-auth-user-reader.ts';
import { withImmediateTransaction } from './sqlite-transaction.ts';

interface RecoveryRow {
  created_at: string;
  created_by_user_id: string;
  expires_at: string;
  id: string;
  revoked_at: string | null;
  token_hash: string;
  used_at: string | null;
  user_id: string;
}

export class SqliteRecoveryRepository {
  private readonly database: DatabaseSync;
  private readonly users: SqliteAuthUserReader;

  constructor(database: DatabaseSync) {
    this.database = database;
    this.users = new SqliteAuthUserReader(database);
  }

  create(
    record: CreateRecoveryRecord,
    audit?: (result: RecoveryIssueMutationResult) => readonly SecurityAuditCommand[],
  ): Promise<RecoveryIssueMutationResult> {
    return Promise.resolve(withImmediateTransaction(this.database, () => {
      if (!this.users.find(record.userId)) throw new AccessUserNotFoundError();
      const revokedRecoveryIds = (this.database.prepare(`
        SELECT id FROM auth_recovery_tokens
        WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
        ORDER BY id
      `).all(record.userId, record.createdAt) as unknown as Array<{ id: string }>)
        .map((item) => item.id);
      this.database.prepare(`
        UPDATE auth_recovery_tokens SET revoked_at = ?
        WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
      `).run(record.createdAt, record.userId, record.createdAt);
      this.database.prepare(`
        INSERT INTO auth_recovery_tokens (
          id, token_hash, user_id, created_by_user_id, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.tokenHash, record.userId, record.createdByUserId,
        record.createdAt, record.expiresAt,
      );
      const recovery: AuthRecovery = {
        ...record,
        revokedAt: null,
        usedAt: null,
      };
      const result = { recovery, revokedRecoveryIds };
      if (audit) {
        try {
          for (const event of audit(result)) enqueueSecurityAudit(this.database, event);
        } catch (error) {
          throw new AppError(
            'SECURITY_AUDIT_UNAVAILABLE',
            'Security audit is temporarily unavailable.',
            503,
            { cause: error },
          );
        }
      }
      return result;
    }));
  }

  async find(tokenHash: string): Promise<AuthRecovery | undefined> {
    const row = this.database.prepare(
      'SELECT * FROM auth_recovery_tokens WHERE token_hash = ?',
    ).get(tokenHash) as unknown as RecoveryRow | undefined;
    return row ? {
      createdAt: row.created_at,
      createdByUserId: row.created_by_user_id,
      expiresAt: row.expires_at,
      id: row.id,
      revokedAt: row.revoked_at,
      tokenHash: row.token_hash,
      usedAt: row.used_at,
      userId: row.user_id,
    } : undefined;
  }

  redeem(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
    audit?: (
      user: AuthUser,
      revokedRecoveryIds: readonly string[],
      sessionCount: number,
    ) => readonly SecurityAuditCommand[],
  ): Promise<AuthUser | undefined> {
    return Promise.resolve(withImmediateTransaction(this.database, () => {
      const row = this.database.prepare(`
        SELECT * FROM auth_recovery_tokens
        WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
      `).get(tokenHash, timestamp) as unknown as RecoveryRow | undefined;
      if (!row) return undefined;
      const updated = this.database.prepare(`
        UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE id = ?
      `).run(passwordHash, timestamp, row.user_id);
      if (updated.changes !== 1) return undefined;
      const revokedRecoveryIds = (this.database.prepare(`
        SELECT id FROM auth_recovery_tokens
        WHERE user_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > ?
        ORDER BY id
      `).all(row.user_id, row.id, timestamp) as unknown as Array<{ id: string }>)
        .map((item) => item.id);
      this.database.prepare('UPDATE auth_recovery_tokens SET used_at = ? WHERE id = ?')
        .run(timestamp, row.id);
      this.database.prepare(`
        UPDATE auth_recovery_tokens SET revoked_at = ?
        WHERE user_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > ?
      `).run(timestamp, row.user_id, row.id, timestamp);
      const sessions = this.database.prepare(`
        UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
      `).run(timestamp, row.user_id);
      const user = this.users.require(row.user_id);
      if (audit) {
        for (const event of audit(user, revokedRecoveryIds, Number(sessions.changes))) {
          enqueueSecurityAudit(this.database, event);
        }
      }
      return user;
    }));
  }

  revoke(id: string, timestamp: string, audit?: SecurityAuditCommand): Promise<boolean> {
    return Promise.resolve(withImmediateTransaction(this.database, () => {
      const result = this.database.prepare(`
        UPDATE auth_recovery_tokens SET revoked_at = ?
        WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
      `).run(timestamp, id);
      if (result.changes === 1 && audit) enqueueSecurityAudit(this.database, audit);
      return result.changes === 1;
    }));
  }
}
