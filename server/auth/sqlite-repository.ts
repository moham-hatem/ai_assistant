import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import {
  isAuthRole,
  normalizeDisplayName,
  normalizeRoles,
  type AuthSession,
  type AuthUser,
} from './domain.ts';
import {
  AuthUserNotFoundError,
  DuplicateAuthUserError,
  type AuthRepository,
  type SaveUserCommand,
} from './repository.ts';
import { migrateAuthDatabase } from './sqlite-migrations.ts';

interface UserRow {
  created_at: string;
  display_name: string;
  email: string;
  id: string;
  password_hash: string;
  updated_at: string;
}

interface SessionRow {
  absolute_expires_at: string;
  created_at: string;
  idle_expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  token_hash: string;
  user_id: string;
}

export class SqliteAuthRepository implements AuthRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    migrateAuthDatabase(this.database);
  }

  async createUser(command: SaveUserCommand): Promise<AuthUser> {
    requireNormalizedDisplayName(command.displayName);
    try {
      transaction(this.database, () => {
        this.database.prepare(`
          INSERT INTO auth_users (
            id, email, password_hash, created_at, updated_at, display_name
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          command.id,
          command.email,
          command.passwordHash,
          command.timestamp,
          command.timestamp,
          command.displayName,
        );
        this.replaceRoles(command.id, command.roles);
      });
      return this.requireUser(command.id);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new DuplicateAuthUserError();
      }
      throw error;
    }
  }

  async findUserByEmail(normalizedEmail: string): Promise<AuthUser | undefined> {
    const row = this.database.prepare(
      'SELECT * FROM auth_users WHERE email = ?',
    ).get(normalizedEmail) as unknown as UserRow | undefined;
    return row ? this.toUser(row) : undefined;
  }

  async findUserById(id: string): Promise<AuthUser | undefined> {
    const row = this.database.prepare(
      'SELECT * FROM auth_users WHERE id = ?',
    ).get(id) as unknown as UserRow | undefined;
    return row ? this.toUser(row) : undefined;
  }

  async saveSession(session: AuthSession): Promise<void> {
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

  async findSession(tokenHash: string): Promise<AuthSession | undefined> {
    const row = this.database.prepare(
      'SELECT * FROM auth_sessions WHERE token_hash = ?',
    ).get(tokenHash) as unknown as SessionRow | undefined;
    return row ? toSession(row) : undefined;
  }

  async touchSession(tokenHash: string, lastSeenAt: string, idleExpiresAt: string): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE auth_sessions SET last_seen_at = ?, idle_expires_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL
        AND idle_expires_at > ? AND absolute_expires_at > ?
    `).run(lastSeenAt, idleExpiresAt, tokenHash, lastSeenAt, lastSeenAt);
    return result.changes === 1;
  }

  async revokeSession(tokenHash: string, revokedAt: string): Promise<void> {
    this.database.prepare(`
      UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?
    `).run(revokedAt, tokenHash);
  }

  async revokeAllUserSessions(userId: string, revokedAt: string): Promise<void> {
    this.database.prepare(`
      UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
    `).run(revokedAt, userId);
  }

  async updateUserSecurity(command: SaveUserCommand): Promise<AuthUser> {
    requireNormalizedDisplayName(command.displayName);
    transaction(this.database, () => {
      const result = this.database.prepare(`
        UPDATE auth_users
        SET email = ?, password_hash = ?, display_name = ?, updated_at = ?
        WHERE id = ?
      `).run(
        command.email,
        command.passwordHash,
        command.displayName,
        command.timestamp,
        command.id,
      );
      if (result.changes !== 1) throw new AuthUserNotFoundError();
      this.replaceRoles(command.id, command.roles);
      this.database.prepare(`
        UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
      `).run(command.timestamp, command.id);
    });
    return this.requireUser(command.id);
  }

  close(): void {
    this.database.close();
  }

  private replaceRoles(userId: string, roles: readonly AuthRole[]): void {
    this.database.prepare('DELETE FROM auth_user_roles WHERE user_id = ?').run(userId);
    const insert = this.database.prepare(
      'INSERT INTO auth_user_roles (user_id, role) VALUES (?, ?)',
    );
    for (const role of normalizeRoles(roles)) insert.run(userId, role);
  }

  private requireUser(id: string): AuthUser {
    const row = this.database.prepare('SELECT * FROM auth_users WHERE id = ?').get(id) as
      unknown as UserRow | undefined;
    if (!row) throw new AuthUserNotFoundError();
    return this.toUser(row);
  }

  private toUser(row: UserRow): AuthUser {
    const roles = this.database.prepare(`
      SELECT role FROM auth_user_roles WHERE user_id = ? ORDER BY role
    `).all(row.id) as unknown as Array<{ role: string }>;
    return {
      createdAt: row.created_at,
      displayName: row.display_name,
      email: row.email,
      id: row.id,
      passwordHash: row.password_hash,
      roles: roles.map((item) => item.role).filter(isAuthRole),
      updatedAt: row.updated_at,
    };
  }
}

function toSession(row: SessionRow): AuthSession {
  return {
    absoluteExpiresAt: row.absolute_expires_at,
    createdAt: row.created_at,
    idleExpiresAt: row.idle_expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    tokenHash: row.token_hash,
    userId: row.user_id,
  };
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

function requireNormalizedDisplayName(value: string): void {
  if (normalizeDisplayName(value) !== value) throw new Error('Display name is not normalized.');
}
