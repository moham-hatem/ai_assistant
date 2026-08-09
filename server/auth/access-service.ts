import { randomUUID } from 'node:crypto';
import type {
  AccessUserDetails,
  AccessUserPage,
  SecretLinkResponse,
} from '../../shared/contracts/access-management.ts';
import type { SecurityAuditService } from '../modules/security-audit/service.ts';
import { AccessAuditEmitter } from './access-audit.ts';
import {
  AccessConflictError,
  AccessLockoutError,
  AccessUserNotFoundError,
  type AccessRepository,
} from './access-repository.ts';
import {
  AccessRateLimitError,
  AccessTokenRejectedError,
  InvalidAccessInputError,
} from './access-errors.ts';
import {
  AccessTokenService,
  type AccessTokenServiceOptions,
} from './access-token-service.ts';
import { AccessUserService } from './access-user-service.ts';
import type { PasswordHasher } from './password.ts';
import type { LoginRateLimiter } from './rate-limit.ts';
import type { AuthRepository } from './repository.ts';
import { createSessionToken } from './token.ts';

export type AccessServiceOptions = AccessTokenServiceOptions;
export {
  AccessConflictError,
  AccessLockoutError,
  AccessRateLimitError,
  AccessTokenRejectedError,
  AccessUserNotFoundError,
  InvalidAccessInputError,
};

export class AccessService {
  private readonly tokens: AccessTokenService;
  private readonly users: AccessUserService;

  constructor(
    repository: AuthRepository & AccessRepository,
    passwords: PasswordHasher,
    rateLimiter: LoginRateLimiter,
    options: AccessServiceOptions,
    now: () => Date = () => new Date(),
    tokenFactory: () => string = createSessionToken,
    idFactory: () => string = randomUUID,
    auditService?: SecurityAuditService,
  ) {
    const audit = new AccessAuditEmitter(auditService, repository, now);
    this.tokens = new AccessTokenService(
      repository, passwords, rateLimiter, options, now, tokenFactory, idFactory, audit,
    );
    this.users = new AccessUserService(repository, audit, now);
  }

  listUsers(cursor: unknown, limit: unknown): Promise<AccessUserPage> {
    return this.users.list(cursor, limit);
  }

  getUser(userId: string): Promise<AccessUserDetails> {
    return this.users.get(userId);
  }

  updateUser(
    actorId: string,
    userId: string,
    input: { displayName: unknown; roles: unknown },
    requestId: string = randomUUID(),
  ): Promise<AccessUserDetails> {
    return this.users.update(actorId, userId, input, requestId);
  }

  setEnabled(
    actorId: string,
    userId: string,
    enabled: boolean,
    requestId: string = randomUUID(),
  ): Promise<AccessUserDetails> {
    return this.users.setEnabled(actorId, userId, enabled, requestId);
  }

  revokeAllSessions(
    actorId: string,
    userId: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    return this.users.revokeSessions(actorId, userId, requestId);
  }

  createInvitation(
    actorId: string,
    input: { displayName: unknown; email: unknown; roles: unknown },
    requestId: string = randomUUID(),
  ): Promise<SecretLinkResponse> {
    return this.tokens.createInvitation(actorId, input, requestId);
  }

  redeemInvitation(
    token: unknown,
    password: unknown,
    rateLimitKey: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    return this.tokens.redeemInvitation(token, password, rateLimitKey, requestId);
  }

  revokeInvitation(actorId: string, id: string, requestId: string = randomUUID()): Promise<void> {
    return this.tokens.revokeInvitation(actorId, id, requestId);
  }

  createRecovery(
    actorId: string,
    userId: string,
    requestId: string = randomUUID(),
  ): Promise<SecretLinkResponse> {
    return this.tokens.createRecovery(actorId, userId, requestId);
  }

  redeemRecovery(
    token: unknown,
    password: unknown,
    rateLimitKey: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    return this.tokens.redeemRecovery(token, password, rateLimitKey, requestId);
  }

  revokeRecovery(actorId: string, id: string, requestId: string = randomUUID()): Promise<void> {
    return this.tokens.revokeRecovery(actorId, id, requestId);
  }
}
