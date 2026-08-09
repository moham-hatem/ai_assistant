import { randomUUID } from 'node:crypto';
import type {
  AccessUserDetails,
  AccessUserPage,
} from '../../shared/contracts/access-management.ts';
import type { AuthRole } from '../../shared/contracts/auth.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import { AccessAuditEmitter } from './access-audit.ts';
import {
  AccessLockoutError,
  AccessUserNotFoundError,
  type AccessRepository,
} from './access-repository.ts';
import { InvalidAccessInputError } from './access-errors.ts';
import {
  isAuthRole,
  normalizeDisplayName,
  normalizeRoles,
  type AuthUser,
} from './domain.ts';
import type { AuthRepository } from './repository.ts';

export class AccessUserService {
  private readonly repository: AuthRepository & AccessRepository;
  private readonly audit: AccessAuditEmitter;
  private readonly now: () => Date;

  constructor(
    repository: AuthRepository & AccessRepository,
    audit: AccessAuditEmitter,
    now: () => Date,
  ) {
    this.repository = repository;
    this.audit = audit;
    this.now = now;
  }

  async list(cursor: unknown, limit: unknown): Promise<AccessUserPage> {
    const parsedCursor = parseCursor(cursor);
    const parsedLimit = parseLimit(limit);
    const users = await this.repository.listUsers(parsedCursor, parsedLimit + 1);
    const hasMore = users.length > parsedLimit;
    const items = users.slice(0, parsedLimit);
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
  }

  async get(userId: string): Promise<AccessUserDetails> {
    requireId(userId);
    const user = await this.repository.findUserById(userId);
    if (!user) throw new AccessUserNotFoundError();
    return safeUser(user);
  }

  async update(
    actorId: string,
    userId: string,
    input: { displayName: unknown; roles: unknown },
    requestId: string = randomUUID(),
  ): Promise<AccessUserDetails> {
    requireId(actorId);
    requireId(userId);
    if (input.displayName === undefined && input.roles === undefined) {
      throw new InvalidAccessInputError();
    }
    const attemptedAction = input.roles !== undefined
      ? 'access.user_roles_changed'
      : 'access.user_profile_changed';
    const subject = { id: userId, type: 'user' } as const;
    let current: AuthUser | undefined;
    try {
      current = await this.repository.findUserById(userId);
    } catch (error) {
      await this.audit.bestEffort(
        attemptedAction, 'failure', requestId, actorId, subject,
        { reason: 'storage_failure' },
      );
      throw error;
    }
    if (!current) {
      await this.audit.bestEffort(
        attemptedAction, 'denied', requestId, actorId, subject, { reason: 'not_found' },
      );
      throw new AccessUserNotFoundError();
    }
    const displayName = input.displayName === undefined
      ? current.displayName
      : normalizeDisplayName(input.displayName);
    const roles = input.roles === undefined ? current.roles : parseRoles(input.roles);
    if (!displayName || !roles) throw new InvalidAccessInputError();
    const displayNameChanged = displayName !== current.displayName;
    const rolesChanged = !sameRoles(roles, current.roles);
    if (!displayNameChanged && !rolesChanged) return safeUser(current);
    const timestamp = this.now().toISOString();
    const events: SecurityAuditCommand[] = [];
    const profileEvent = displayNameChanged ? this.audit.success(
      'access.user_profile_changed', requestId, timestamp, actorId, subject,
      { displayNameChanged: true },
    ) : undefined;
    const rolesEvent = rolesChanged ? this.audit.success(
      'access.user_roles_changed', requestId, timestamp, actorId, subject,
      { nextRoleCount: roles.length, previousRoleCount: current.roles.length },
    ) : undefined;
    const sessionsEvent = this.audit.success(
      'access.user_sessions_revoked', requestId, timestamp, actorId, subject,
      { reason: 'user_access_changed' },
    );
    if (profileEvent) events.push(profileEvent);
    if (rolesEvent) events.push(rolesEvent);
    if (sessionsEvent) events.push(sessionsEvent);
    let user: AuthUser;
    try {
      user = await this.repository.updateUserAccess({
        actorId, displayName, roles, timestamp, userId,
      }, events);
    } catch (error) {
      const action = rolesChanged ? 'access.user_roles_changed' : 'access.user_profile_changed';
      const expected = error instanceof AccessLockoutError
        || error instanceof AccessUserNotFoundError;
      const outcome = expected ? 'denied' : 'failure';
      const reason = error instanceof AccessUserNotFoundError ? 'not_found'
        : error instanceof AccessLockoutError
        ? actorId === userId ? 'self_lockout' : 'last_admin'
        : 'storage_failure';
      await this.audit.bestEffort(action, outcome, requestId, actorId, subject, { reason });
      throw error;
    }
    await this.audit.flush(this.repository);
    return safeUser(user);
  }

  async setEnabled(
    actorId: string,
    userId: string,
    enabled: boolean,
    requestId: string = randomUUID(),
  ): Promise<AccessUserDetails> {
    requireId(actorId);
    requireId(userId);
    const timestamp = this.now().toISOString();
    const subject = { id: userId, type: 'user' } as const;
    const action = enabled ? 'access.user_enabled' : 'access.user_disabled';
    const events: SecurityAuditCommand[] = [];
    const stateEvent = this.audit.success(action, requestId, timestamp, actorId, subject);
    if (stateEvent) events.push(stateEvent);
    if (!enabled) {
      const sessionsEvent = this.audit.success(
        'access.user_sessions_revoked', requestId, timestamp, actorId, subject,
        { reason: 'user_disabled' },
      );
      if (sessionsEvent) events.push(sessionsEvent);
    }
    let user: AuthUser;
    try {
      user = await this.repository.setUserEnabled(actorId, userId, enabled, timestamp, events);
    } catch (error) {
      const expected = error instanceof AccessLockoutError
        || error instanceof AccessUserNotFoundError;
      const outcome = expected ? 'denied' : 'failure';
      const reason = error instanceof AccessUserNotFoundError ? 'not_found'
        : error instanceof AccessLockoutError
        ? actorId === userId ? 'self_lockout' : 'last_admin'
        : 'storage_failure';
      await this.audit.bestEffort(action, outcome, requestId, actorId, subject, { reason });
      throw error;
    }
    await this.audit.flush(this.repository);
    return safeUser(user);
  }

  async revokeSessions(
    actorId: string,
    userId: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    requireId(actorId);
    requireId(userId);
    const timestamp = this.now().toISOString();
    const subject = { id: userId, type: 'user' } as const;
    try {
      if (!await this.repository.findUserById(userId)) throw new AccessUserNotFoundError();
      await this.repository.revokeAllUserSessions(userId, timestamp, this.audit.success(
        'access.user_sessions_revoked', requestId, timestamp, actorId,
        subject, { reason: 'administrative' },
      ));
    } catch (error) {
      const expected = error instanceof AccessUserNotFoundError;
      await this.audit.bestEffort(
        'access.user_sessions_revoked', expected ? 'denied' : 'failure',
        requestId, actorId, subject,
        { reason: expected ? 'not_found' : 'storage_failure' },
      );
      throw error;
    }
    await this.audit.flush(this.repository);
  }
}

function sameRoles(left: readonly AuthRole[], right: readonly AuthRole[]): boolean {
  const normalizedLeft = normalizeRoles(left);
  const normalizedRight = normalizeRoles(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((role, index) => role === normalizedRight[index]);
}

function safeUser(user: AuthUser): AccessUserDetails {
  return {
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    enabled: user.enabled,
    id: user.id,
    roles: user.roles,
    updatedAt: user.updatedAt,
  };
}

function parseRoles(value: unknown): AuthRole[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4 || !value.every(isAuthRole)) {
    return undefined;
  }
  return normalizeRoles(value as AuthRole[]);
}

function parseCursor(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 128 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new InvalidAccessInputError();
  }
  return value;
}

function parseLimit(value: unknown): number {
  if (value === null || value === undefined || value === '') return 25;
  const parsed = typeof value === 'string' && /^\d{1,3}$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new InvalidAccessInputError();
  }
  return parsed;
}

function requireId(value: string): void {
  if (!value || value.length > 128 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new InvalidAccessInputError();
  }
}
