import type { DatabaseSync } from 'node:sqlite';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import { AccessUserNotFoundError } from './access-repository.ts';
import { isAuthRole, type AuthUser } from './domain.ts';

export interface AuthUserRow {
  created_at: string;
  display_name: string;
  email: string;
  enabled: number;
  id: string;
  password_hash: string;
  updated_at: string;
}

export class SqliteAuthUserReader {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  find(id: string): AuthUserRow | undefined {
    return this.database.prepare('SELECT * FROM auth_users WHERE id = ?').get(id) as
      unknown as AuthUserRow | undefined;
  }

  require(id: string): AuthUser {
    const row = this.find(id);
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

  rolesFor(userId: string): AuthRole[] {
    const rows = this.database.prepare(`
      SELECT role FROM auth_user_roles WHERE user_id = ? ORDER BY role
    `).all(userId) as unknown as Array<{ role: string }>;
    return rows.map((item) => item.role).filter(isAuthRole);
  }
}
