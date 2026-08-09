import type { DatabaseSync } from 'node:sqlite';
import type { AccessUserSummary } from '../../shared/contracts/access-management.ts';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import {
  AccessLockoutError,
  AccessUserNotFoundError,
} from './access-repository.ts';
import {
  isAuthRole,
  normalizeDisplayName,
  normalizeRoles,
  type AuthUser,
} from './domain.ts';

interface UserRow {
  created_at: string;
  display_name: string;
  email: string;
  enabled: number;
  id: string;
  password_hash: string;
  updated_at: string;
}

export class SqliteAccessUserRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async list(afterId: string | undefined, limit: number): Promise<AccessUserSummary[]> {
    const rows = this.database.prepare(`
      SELECT * FROM auth_users
      WHERE (? IS NULL OR id > ?)
      ORDER BY id
      LIMIT ?
    `).all(afterId ?? null, afterId ?? null, limit) as unknown as UserRow[];
    return rows.map((row) => {
      const { passwordHash: _passwordHash, ...safe } = this.toUser(row);
      return safe;
    });
  }

  async update(command: {
    actorId: string;
    displayName: string;
    roles: AuthRole[];
    timestamp: string;
    userId: string;
  }): Promise<AuthUser> {
    if (normalizeDisplayName(command.displayName) !== command.displayName) {
      throw new Error('Display name is not normalized.');
    }
    return transaction(this.database, () => {
      const current = this.findRow(command.userId);
      if (!current) throw new AccessUserNotFoundError();
      const roles = normalizeRoles(command.roles);
      if (command.actorId === command.userId && !roles.includes('admin')) {
        throw new AccessLockoutError('Administrators cannot remove their own settings access.');
      }
      this.assertLastAdminRemains(current, current.enabled === 1, roles);
      this.database.prepare(`
        UPDATE auth_users SET display_name = ?, updated_at = ? WHERE id = ?
      `).run(command.displayName, command.timestamp, command.userId);
      this.replaceRoles(command.userId, roles);
      this.revokeSessions(command.userId, command.timestamp);
      return this.requireUser(command.userId);
    });
  }

  async setEnabled(
    actorId: string,
    userId: string,
    enabled: boolean,
    timestamp: string,
  ): Promise<AuthUser> {
    return transaction(this.database, () => {
      const current = this.findRow(userId);
      if (!current) throw new AccessUserNotFoundError();
      if (actorId === userId && !enabled) {
        throw new AccessLockoutError('Administrators cannot disable themselves.');
      }
      const roles = this.rolesFor(userId);
      this.assertLastAdminRemains(current, enabled, roles);
      this.database.prepare(`
        UPDATE auth_users SET enabled = ?, updated_at = ? WHERE id = ?
      `).run(enabled ? 1 : 0, timestamp, userId);
      if (!enabled) this.revokeSessions(userId, timestamp);
      return this.requireUser(userId);
    });
  }

  private assertLastAdminRemains(
    current: UserRow,
    nextEnabled: boolean,
    nextRoles: readonly AuthRole[],
  ): void {
    const currentlyAdmin = current.enabled === 1 && this.rolesFor(current.id).includes('admin');
    const remainsAdmin = nextEnabled && nextRoles.includes('admin');
    if (!currentlyAdmin || remainsAdmin) return;
    const row = this.database.prepare(`
      SELECT count(*) AS count
      FROM auth_users users
      JOIN auth_user_roles roles ON roles.user_id = users.id
      WHERE users.enabled = 1 AND roles.role = 'admin'
    `).get() as unknown as { count: number };
    if (row.count <= 1) throw new AccessLockoutError('The last enabled administrator is required.');
  }

  private revokeSessions(userId: string, timestamp: string): void {
    this.database.prepare(`
      UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
    `).run(timestamp, userId);
  }

  private replaceRoles(userId: string, roles: readonly AuthRole[]): void {
    this.database.prepare('DELETE FROM auth_user_roles WHERE user_id = ?').run(userId);
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

  private findRow(id: string): UserRow | undefined {
    return this.database.prepare('SELECT * FROM auth_users WHERE id = ?').get(id) as
      unknown as UserRow | undefined;
  }

  private requireUser(id: string): AuthUser {
    const row = this.findRow(id);
    if (!row) throw new AccessUserNotFoundError();
    return this.toUser(row);
  }

  private toUser(row: UserRow): AuthUser {
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
