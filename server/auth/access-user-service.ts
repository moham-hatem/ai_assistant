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
    const subject = isValidId(userId) ? { id: userId, type: 'user' } as const : null;
    const attemptedAction = input.roles !== undefined
      ? 'access.user_roles_changed'
      : 'access.user_profile_changed';
    if (!subject) {
      await this.audit.durableDenied(
        attemptedAction, requestId, actorId, null, { reason: 'invalid_request' },
      );
      throw new InvalidAccessInputError();
    }
    if (input.displayName === undefined && input.roles === undefined) {
      await this.audit.durableDenied(
        attemptedAction, requestId, actorId, subject, { reason: 'invalid_request' },
      );
      throw new InvalidAccessInputError();
    }
    const displayName = input.displayName === undefined
      ? undefined
      : normalizeDisplayName(input.displayName);
    const roles = input.roles === undefined ? undefined : parseRoles(input.roles);
    if ((input.displayName !== undefined && !displayName)
        || (input.roles !== undefined && !roles)) {
      await this.audit.durableDenied(
        attemptedAction, requestId, actorId, subject, { reason: 'invalid_request' },
      );
      throw new InvalidAccessInputError();
    }
    const timestamp = this.now().toISOString();
    let user: AuthUser;
    try {
      const result = await this.repository.updateUserAccess({
        actorId, displayName, roles, timestamp, userId,
      }, (mutation) => {
        const events: SecurityAuditCommand[] = [];
        if (input.displayName !== undefined) pushEvent(events, this.audit.success(
          'access.user_profile_changed', requestId, timestamp, actorId, subject,
          { changed: mutation.displayNameChanged },
        ));
        if (input.roles !== undefined) pushEvent(events, this.audit.success(
          'access.user_roles_changed', requestId, timestamp, actorId, subject,
          {
            changed: mutation.rolesChanged,
            nextRoleCount: mutation.nextRoleCount,
            previousRoleCount: mutation.previousRoleCount,
          },
        ));
        if (mutation.displayNameChanged || mutation.rolesChanged) pushEvent(events, this.audit.success(
          'access.user_sessions_revoked', requestId, timestamp, actorId, subject,
          { reason: 'user_access_changed', sessionCount: mutation.revokedSessionCount },
        ));
        return events;
      });
      user = result.user;
    } catch (error) {
      const expected = error instanceof AccessLockoutError
        || error instanceof AccessUserNotFoundError;
      const outcome = expected ? 'denied' : 'failure';
      const reason = error instanceof AccessUserNotFoundError ? 'not_found'
        : error instanceof AccessLockoutError
        ? actorId === userId ? 'self_lockout' : 'last_admin'
        : 'storage_failure';
      await this.audit.bestEffort(
        attemptedAction, outcome, requestId, actorId, subject, { reason },
      );
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
    const action = enabled ? 'access.user_enabled' : 'access.user_disabled';
    const subject = isValidId(userId) ? { id: userId, type: 'user' } as const : null;
    if (!subject || typeof enabled !== 'boolean') {
      await this.audit.durableDenied(
        action, requestId, actorId, subject, { reason: 'invalid_request' },
      );
      throw new InvalidAccessInputError();
    }
    const timestamp = this.now().toISOString();
    let user: AuthUser;
    try {
      const result = await this.repository.setUserEnabled(
        actorId,
        userId,
        enabled,
        timestamp,
        (mutation) => {
          const events: SecurityAuditCommand[] = [];
          pushEvent(events, this.audit.success(
            action, requestId, timestamp, actorId, subject, { changed: mutation.changed },
          ));
          if (!enabled && mutation.changed) pushEvent(events, this.audit.success(
            'access.user_sessions_revoked', requestId, timestamp, actorId, subject,
            { reason: 'user_disabled', sessionCount: mutation.revokedSessionCount },
          ));
          return events;
        },
      );
      user = result.user;
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
    const subject = isValidId(userId) ? { id: userId, type: 'user' } as const : null;
    if (!subject) {
      await this.audit.durableDenied(
        'access.user_sessions_revoked', requestId, actorId, null,
        { reason: 'invalid_request' },
      );
      throw new InvalidAccessInputError();
    }
    const timestamp = this.now().toISOString();
    try {
      if (!await this.repository.findUserById(userId)) throw new AccessUserNotFoundError();
      await this.repository.revokeAllUserSessions(userId, timestamp, (sessionCount) => (
        this.audit.success(
          'access.user_sessions_revoked', requestId, timestamp, actorId,
          subject, { reason: 'administrative', sessionCount },
        )
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
  if (!isValidId(value)) {
    throw new InvalidAccessInputError();
  }
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !/[\p{Cc}\p{Cf}]/u.test(value);
}

function pushEvent(events: SecurityAuditCommand[], event: SecurityAuditCommand | undefined): void {
  if (event) events.push(event);
}
