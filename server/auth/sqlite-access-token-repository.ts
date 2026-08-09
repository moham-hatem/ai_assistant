import type { DatabaseSync } from 'node:sqlite';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import {
  AccessConflictError,
  AccessUserNotFoundError,
  type CreateInvitationRecord,
  type CreateRecoveryRecord,
} from './access-repository.ts';
import {
  isAuthRole,
  normalizeRoles,
  type AuthInvitation,
  type AuthRecovery,
  type AuthUser,
} from './domain.ts';

interface InvitationRow {
  created_at: string;
  created_by_user_id: string;
  display_name: string;
  email: string;
  expires_at: string;
  id: string;
  revoked_at: string | null;
  token_hash: string;
  used_at: string | null;
}

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

interface UserRow {
  created_at: string;
  display_name: string;
  email: string;
  enabled: number;
  id: string;
  password_hash: string;
  updated_at: string;
}

export class SqliteAccessTokenRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async createInvitation(record: CreateInvitationRecord): Promise<AuthInvitation> {
    try {
      transaction(this.database, () => {
        if (this.database.prepare('SELECT 1 FROM auth_users WHERE email = ?').get(record.email)) {
          throw new AccessConflictError();
        }
        this.database.prepare(`
          INSERT INTO auth_invitations (
            id, token_hash, email, display_name, created_by_user_id, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.id, record.tokenHash, record.email, record.displayName,
          record.createdByUserId, record.createdAt, record.expiresAt,
        );
        const insertRole = this.database.prepare(`
          INSERT INTO auth_invitation_roles (invitation_id, role) VALUES (?, ?)
        `);
        for (const role of normalizeRoles(record.roles)) insertRole.run(record.id, role);
      });
      return (await this.findInvitation(record.tokenHash))!;
    } catch (error) {
      if (error instanceof AccessConflictError) throw error;
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new AccessConflictError();
      }
      throw error;
    }
  }

  async findInvitation(tokenHash: string): Promise<AuthInvitation | undefined> {
    const row = this.database.prepare(
      'SELECT * FROM auth_invitations WHERE token_hash = ?',
    ).get(tokenHash) as unknown as InvitationRow | undefined;
    if (!row) return undefined;
    return {
      createdAt: row.created_at,
      createdByUserId: row.created_by_user_id,
      displayName: row.display_name,
      email: row.email,
      expiresAt: row.expires_at,
      id: row.id,
      revokedAt: row.revoked_at,
      roles: this.invitationRoles(row.id),
      tokenHash: row.token_hash,
      usedAt: row.used_at,
    };
  }

  async redeemInvitation(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
  ): Promise<AuthUser | undefined> {
    return transaction(this.database, () => {
      const row = this.database.prepare(`
        SELECT * FROM auth_invitations
        WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
      `).get(tokenHash, timestamp) as unknown as InvitationRow | undefined;
      if (!row) return undefined;
      if (this.database.prepare('SELECT 1 FROM auth_users WHERE email = ?').get(row.email)) {
        this.database.prepare('UPDATE auth_invitations SET used_at = ? WHERE id = ?')
          .run(timestamp, row.id);
        return undefined;
      }
      const userId = crypto.randomUUID();
      this.database.prepare(`
        INSERT INTO auth_users (
          id, email, password_hash, created_at, updated_at, display_name, enabled
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(userId, row.email, passwordHash, timestamp, timestamp, row.display_name);
      this.replaceRoles(userId, this.invitationRoles(row.id));
      this.database.prepare('UPDATE auth_invitations SET used_at = ? WHERE id = ?')
        .run(timestamp, row.id);
      return this.requireUser(userId);
    });
  }

  async createRecovery(record: CreateRecoveryRecord): Promise<AuthRecovery> {
    if (!this.findUserRow(record.userId)) throw new AccessUserNotFoundError();
    this.database.prepare(`
      INSERT INTO auth_recovery_tokens (
        id, token_hash, user_id, created_by_user_id, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.tokenHash, record.userId, record.createdByUserId,
      record.createdAt, record.expiresAt,
    );
    return (await this.findRecovery(record.tokenHash))!;
  }

  async findRecovery(tokenHash: string): Promise<AuthRecovery | undefined> {
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

  async redeemRecovery(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
  ): Promise<boolean> {
    return transaction(this.database, () => {
      const row = this.database.prepare(`
        SELECT * FROM auth_recovery_tokens
        WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
      `).get(tokenHash, timestamp) as unknown as RecoveryRow | undefined;
      if (!row) return false;
      const updated = this.database.prepare(`
        UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE id = ?
      `).run(passwordHash, timestamp, row.user_id);
      if (updated.changes !== 1) return false;
      this.database.prepare('UPDATE auth_recovery_tokens SET used_at = ? WHERE id = ?')
        .run(timestamp, row.id);
      this.database.prepare(`
        UPDATE auth_recovery_tokens SET revoked_at = ?
        WHERE user_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
      `).run(timestamp, row.user_id, row.id);
      this.database.prepare(`
        UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
      `).run(timestamp, row.user_id);
      return true;
    });
  }

  async revokeInvitation(id: string, timestamp: string): Promise<boolean> {
    return this.revokeUnused('auth_invitations', id, timestamp);
  }

  async revokeRecovery(id: string, timestamp: string): Promise<boolean> {
    return this.revokeUnused('auth_recovery_tokens', id, timestamp);
  }

  private revokeUnused(table: 'auth_invitations' | 'auth_recovery_tokens', id: string, timestamp: string): boolean {
    const result = this.database.prepare(`
      UPDATE ${table} SET revoked_at = ?
      WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
    `).run(timestamp, id);
    return result.changes === 1;
  }

  private invitationRoles(invitationId: string): AuthRole[] {
    const rows = this.database.prepare(`
      SELECT role FROM auth_invitation_roles WHERE invitation_id = ? ORDER BY role
    `).all(invitationId) as unknown as Array<{ role: string }>;
    return rows.map((item) => item.role).filter(isAuthRole);
  }

  private replaceRoles(userId: string, roles: readonly AuthRole[]): void {
    const insert = this.database.prepare(
      'INSERT INTO auth_user_roles (user_id, role) VALUES (?, ?)',
    );
    for (const role of normalizeRoles(roles)) insert.run(userId, role);
  }

  private rolesFor(userId: string): AuthRole[] {
    const rows = this.database.prepare(`
      SELECT role FROM auth_user_roles WHERE user_id = ? ORDER BY role
    `).all(userId) as unknown as Array<{ role: string }>;
    return rows.map((item) => item.role).filter(isAuthRole);
  }

  private findUserRow(id: string): UserRow | undefined {
    return this.database.prepare('SELECT * FROM auth_users WHERE id = ?').get(id) as
      unknown as UserRow | undefined;
  }

  private requireUser(id: string): AuthUser {
    const row = this.findUserRow(id);
    if (!row) throw new AccessUserNotFoundError();
    return {
      createdAt: row.created_at,
      displayName: row.display_name,
      email: row.email,
      enabled: row.enabled === 1,
      id: row.id,
      passwordHash: row.password_hash,
      roles: this.rolesFor(row.id),
      updatedAt: row.updated_at,
    };
  }
}

function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const value = operation();
    database.exec('COMMIT;');
    return value;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}
