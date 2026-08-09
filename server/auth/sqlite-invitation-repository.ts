import type { DatabaseSync } from 'node:sqlite';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import { enqueueSecurityAudit } from '../modules/security-audit/sqlite-outbox.ts';
import {
  AccessConflictError,
  type CreateInvitationRecord,
} from './access-repository.ts';
import {
  isAuthRole,
  normalizeRoles,
  type AuthInvitation,
  type AuthUser,
} from './domain.ts';
import { SqliteAuthUserReader } from './sqlite-auth-user-reader.ts';
import { withImmediateTransaction } from './sqlite-transaction.ts';

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

export class SqliteInvitationRepository {
  private readonly database: DatabaseSync;
  private readonly users: SqliteAuthUserReader;

  constructor(database: DatabaseSync) {
    this.database = database;
    this.users = new SqliteAuthUserReader(database);
  }

  async create(
    record: CreateInvitationRecord,
    audit?: SecurityAuditCommand,
  ): Promise<AuthInvitation> {
    try {
      withImmediateTransaction(this.database, () => {
        if (this.database.prepare('SELECT 1 FROM auth_users WHERE email = ?').get(record.email)) {
          throw new AccessConflictError();
        }
        if (this.database.prepare(`
          SELECT 1 FROM auth_invitations
          WHERE email = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
        `).get(record.email, record.createdAt)) {
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
        if (audit) enqueueSecurityAudit(this.database, audit);
      });
      return (await this.find(record.tokenHash))!;
    } catch (error) {
      if (error instanceof AccessConflictError) throw error;
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new AccessConflictError();
      }
      throw error;
    }
  }

  async find(tokenHash: string): Promise<AuthInvitation | undefined> {
    const row = this.database.prepare(
      'SELECT * FROM auth_invitations WHERE token_hash = ?',
    ).get(tokenHash) as unknown as InvitationRow | undefined;
    return row ? {
      createdAt: row.created_at,
      createdByUserId: row.created_by_user_id,
      displayName: row.display_name,
      email: row.email,
      expiresAt: row.expires_at,
      id: row.id,
      revokedAt: row.revoked_at,
      roles: this.roles(row.id),
      tokenHash: row.token_hash,
      usedAt: row.used_at,
    } : undefined;
  }

  async redeem(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
    audit?: (
      user: AuthUser,
      revokedInvitationIds: readonly string[],
    ) => readonly SecurityAuditCommand[],
  ): Promise<AuthUser | undefined> {
    return withImmediateTransaction(this.database, () => {
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
      const revokedInvitationIds = (this.database.prepare(`
        SELECT id FROM auth_invitations
        WHERE email = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > ?
        ORDER BY id
      `).all(row.email, row.id, timestamp) as unknown as Array<{ id: string }>)
        .map((item) => item.id);
      const userId = crypto.randomUUID();
      this.database.prepare(`
        INSERT INTO auth_users (
          id, email, password_hash, created_at, updated_at, display_name, enabled
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(userId, row.email, passwordHash, timestamp, timestamp, row.display_name);
      const insertRole = this.database.prepare(
        'INSERT INTO auth_user_roles (user_id, role) VALUES (?, ?)',
      );
      for (const role of normalizeRoles(this.roles(row.id))) insertRole.run(userId, role);
      this.database.prepare('UPDATE auth_invitations SET used_at = ? WHERE id = ?')
        .run(timestamp, row.id);
      this.database.prepare(`
        UPDATE auth_invitations SET revoked_at = ?
        WHERE email = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > ?
      `).run(timestamp, row.email, row.id, timestamp);
      const user = this.users.require(userId);
      if (audit) {
        for (const event of audit(user, revokedInvitationIds)) {
          enqueueSecurityAudit(this.database, event);
        }
      }
      return user;
    });
  }

  revoke(id: string, timestamp: string, audit?: SecurityAuditCommand): Promise<boolean> {
    return Promise.resolve(withImmediateTransaction(this.database, () => {
      const result = this.database.prepare(`
        UPDATE auth_invitations SET revoked_at = ?
        WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
      `).run(timestamp, id);
      if (result.changes === 1 && audit) enqueueSecurityAudit(this.database, audit);
      return result.changes === 1;
    }));
  }

  private roles(invitationId: string): AuthRole[] {
    const rows = this.database.prepare(`
      SELECT role FROM auth_invitation_roles WHERE invitation_id = ? ORDER BY role
    `).all(invitationId) as unknown as Array<{ role: string }>;
    return rows.map((item) => item.role).filter(isAuthRole);
  }
}
