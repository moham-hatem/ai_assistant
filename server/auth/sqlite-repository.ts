import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AccessUserSummary } from '../../shared/contracts/access-management.ts';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import type {
  AccessRepository,
  AccessUserEnabledMutationResult,
  AccessUserUpdateMutationResult,
  CreateInvitationRecord,
  CreateRecoveryRecord,
} from './access-repository.ts';
import {
  isAuthRole,
  normalizeDisplayName,
  normalizeRoles,
  type AuthInvitation,
  type AuthRecovery,
  type AuthSession,
  type AuthUser,
} from './domain.ts';
import {
  AuthUserNotFoundError,
  DuplicateAuthUserError,
  type AuthRepository,
  type SaveUserCommand,
} from './repository.ts';
import { SqliteAccessTokenRepository } from './sqlite-access-token-repository.ts';
import { SqliteAccessUserRepository } from './sqlite-access-user-repository.ts';
import { migrateAuthDatabase } from './sqlite-migrations.ts';
import { SqliteSessionRepository } from './sqlite-session-repository.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import type { SecurityAuditSink } from '../modules/security-audit/repository.ts';
import {
  enqueueSecurityAudit,
  flushSecurityAuditOutbox,
  migrateSecurityAuditOutbox,
} from '../modules/security-audit/sqlite-outbox.ts';
import { withImmediateTransaction } from './sqlite-transaction.ts';

interface UserRow {
  created_at: string;
  display_name: string;
  email: string;
  enabled: number;
  id: string;
  password_hash: string;
  updated_at: string;
}

export class SqliteAuthRepository implements AuthRepository, AccessRepository {
  private readonly accessTokens: SqliteAccessTokenRepository;
  private readonly accessUsers: SqliteAccessUserRepository;
  private readonly database: DatabaseSync;
  private readonly sessions: SqliteSessionRepository;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    migrateAuthDatabase(this.database);
    migrateSecurityAuditOutbox(this.database);
    this.accessTokens = new SqliteAccessTokenRepository(this.database);
    this.accessUsers = new SqliteAccessUserRepository(this.database);
    this.sessions = new SqliteSessionRepository(this.database);
  }

  async createUser(command: SaveUserCommand): Promise<AuthUser> {
    requireNormalizedDisplayName(command.displayName);
    try {
      withImmediateTransaction(this.database, () => {
        this.database.prepare(`
          INSERT INTO auth_users (
            id, email, password_hash, created_at, updated_at, display_name, enabled
          ) VALUES (?, ?, ?, ?, ?, ?, 1)
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

  async saveSession(session: AuthSession, audit?: SecurityAuditCommand): Promise<void> {
    await this.sessions.save(session, audit);
  }

  async rotateSession(
    previousTokenHash: string | undefined,
    session: AuthSession,
    audit?: readonly SecurityAuditCommand[],
  ): Promise<void> {
    await this.sessions.rotate(previousTokenHash, session, audit);
  }

  async findSession(tokenHash: string): Promise<AuthSession | undefined> {
    return await this.sessions.find(tokenHash);
  }

  async touchSession(tokenHash: string, lastSeenAt: string, idleExpiresAt: string): Promise<boolean> {
    return await this.sessions.touch(tokenHash, lastSeenAt, idleExpiresAt);
  }

  async revokeSession(tokenHash: string, revokedAt: string, audit?: SecurityAuditCommand): Promise<boolean> {
    return await this.sessions.revoke(tokenHash, revokedAt, audit);
  }

  async revokeAllUserSessions(
    userId: string,
    revokedAt: string,
    audit?: (sessionCount: number) => SecurityAuditCommand | undefined,
  ): Promise<number> {
    return await this.sessions.revokeAll(userId, revokedAt, audit);
  }

  async enqueueSecurityAudit(command: SecurityAuditCommand): Promise<void> {
    withImmediateTransaction(this.database, () => enqueueSecurityAudit(this.database, command));
  }

  flushSecurityAuditOutbox(sink: SecurityAuditSink): Promise<number> {
    return flushSecurityAuditOutbox(this.database, sink);
  }

  async updateUserSecurity(command: SaveUserCommand): Promise<AuthUser> {
    requireNormalizedDisplayName(command.displayName);
    withImmediateTransaction(this.database, () => {
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

  listUsers(afterId: string | undefined, limit: number): Promise<AccessUserSummary[]> {
    return this.accessUsers.list(afterId, limit);
  }

  updateUserAccess(command: {
    actorId: string;
    displayName?: string;
    roles?: AuthRole[];
    timestamp: string;
    userId: string;
  }, audit?: (
    result: AccessUserUpdateMutationResult,
  ) => readonly SecurityAuditCommand[]): Promise<AccessUserUpdateMutationResult> {
    return this.accessUsers.update(command, audit);
  }

  setUserEnabled(
    actorId: string,
    userId: string,
    enabled: boolean,
    timestamp: string,
    audit?: (result: AccessUserEnabledMutationResult) => readonly SecurityAuditCommand[],
  ): Promise<AccessUserEnabledMutationResult> {
    return this.accessUsers.setEnabled(actorId, userId, enabled, timestamp, audit);
  }

  createInvitation(
    record: CreateInvitationRecord,
    audit?: SecurityAuditCommand,
  ): Promise<AuthInvitation> {
    return this.accessTokens.createInvitation(record, audit);
  }

  findInvitationByTokenHash(tokenHash: string): Promise<AuthInvitation | undefined> {
    return this.accessTokens.findInvitation(tokenHash);
  }

  redeemInvitation(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
    audit?: (
      user: AuthUser,
      revokedInvitationIds: readonly string[],
    ) => readonly SecurityAuditCommand[],
  ): Promise<AuthUser | undefined> {
    return this.accessTokens.redeemInvitation(tokenHash, passwordHash, timestamp, audit);
  }

  revokeInvitation(id: string, timestamp: string, audit?: SecurityAuditCommand): Promise<boolean> {
    return this.accessTokens.revokeInvitation(id, timestamp, audit);
  }

  createRecovery(record: CreateRecoveryRecord, audit?: SecurityAuditCommand): Promise<AuthRecovery> {
    return this.accessTokens.createRecovery(record, audit);
  }

  findRecoveryByTokenHash(tokenHash: string): Promise<AuthRecovery | undefined> {
    return this.accessTokens.findRecovery(tokenHash);
  }

  redeemRecovery(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
    audit?: (
      user: AuthUser,
      revokedRecoveryIds: readonly string[],
      sessionCount: number,
    ) => readonly SecurityAuditCommand[],
  ): Promise<AuthUser | undefined> {
    return this.accessTokens.redeemRecovery(tokenHash, passwordHash, timestamp, audit);
  }

  revokeRecovery(id: string, timestamp: string, audit?: SecurityAuditCommand): Promise<boolean> {
    return this.accessTokens.revokeRecovery(id, timestamp, audit);
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

  private rolesFor(userId: string): AuthRole[] {
    const rows = this.database.prepare(`
      SELECT role FROM auth_user_roles WHERE user_id = ? ORDER BY role
    `).all(userId) as unknown as Array<{ role: string }>;
    return rows.map((item) => item.role).filter(isAuthRole);
  }

  private requireUser(id: string): AuthUser {
    const row = this.database.prepare('SELECT * FROM auth_users WHERE id = ?').get(id) as
      unknown as UserRow | undefined;
    if (!row) throw new AuthUserNotFoundError();
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


function requireNormalizedDisplayName(value: string): void {
  if (normalizeDisplayName(value) !== value) throw new Error('Display name is not normalized.');
}
