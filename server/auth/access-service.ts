import { randomUUID } from 'node:crypto';
import type {
  AccessUserDetails,
  AccessUserPage,
  SecretLinkResponse,
} from '../../shared/contracts/access-management.ts';
import type { AuthRole } from '../../shared/contracts/auth.ts';
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
import {
  isAuthRole,
  normalizeDisplayName,
  normalizeRoles,
  type AuthUser,
} from './domain.ts';
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
  private readonly repository: AuthRepository & AccessRepository;
  private readonly now: () => Date;
  private readonly tokens: AccessTokenService;

  constructor(
    repository: AuthRepository & AccessRepository,
    passwords: PasswordHasher,
    rateLimiter: LoginRateLimiter,
    options: AccessServiceOptions,
    now: () => Date = () => new Date(),
    tokenFactory: () => string = createSessionToken,
    idFactory: () => string = randomUUID,
  ) {
    this.repository = repository;
    this.now = now;
    this.tokens = new AccessTokenService(
      repository, passwords, rateLimiter, options, now, tokenFactory, idFactory,
    );
  }

  async listUsers(cursor: unknown, limit: unknown): Promise<AccessUserPage> {
    const parsedCursor = parseCursor(cursor);
    const parsedLimit = parseLimit(limit);
    const users = await this.repository.listUsers(parsedCursor, parsedLimit + 1);
    const hasMore = users.length > parsedLimit;
    const items = users.slice(0, parsedLimit);
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
  }

  async getUser(userId: string): Promise<AccessUserDetails> {
    requireId(userId);
    const user = await this.repository.findUserById(userId);
    if (!user) throw new AccessUserNotFoundError();
    return safeUser(user);
  }

  async updateUser(
    actorId: string,
    userId: string,
    input: { displayName: unknown; roles: unknown },
  ): Promise<AccessUserDetails> {
    requireId(actorId);
    requireId(userId);
    if (input.displayName === undefined && input.roles === undefined) {
      throw new InvalidAccessInputError();
    }
    const current = await this.repository.findUserById(userId);
    if (!current) throw new AccessUserNotFoundError();
    const displayName = input.displayName === undefined
      ? current.displayName
      : normalizeDisplayName(input.displayName);
    const roles = input.roles === undefined ? current.roles : parseRoles(input.roles);
    if (!displayName || !roles) throw new InvalidAccessInputError();
    const user = await this.repository.updateUserAccess({
      actorId,
      displayName,
      roles,
      timestamp: this.now().toISOString(),
      userId,
    });
    return safeUser(user);
  }

  async setEnabled(actorId: string, userId: string, enabled: boolean): Promise<AccessUserDetails> {
    requireId(actorId);
    requireId(userId);
    const user = await this.repository.setUserEnabled(
      actorId, userId, enabled, this.now().toISOString(),
    );
    return safeUser(user);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    requireId(userId);
    if (!await this.repository.findUserById(userId)) throw new AccessUserNotFoundError();
    await this.repository.revokeAllUserSessions(userId, this.now().toISOString());
  }

  createInvitation(
    actorId: string,
    input: { displayName: unknown; email: unknown; roles: unknown },
  ): Promise<SecretLinkResponse> {
    return this.tokens.createInvitation(actorId, input);
  }

  redeemInvitation(token: unknown, password: unknown, rateLimitKey: string): Promise<void> {
    return this.tokens.redeemInvitation(token, password, rateLimitKey);
  }

  revokeInvitation(id: string): Promise<void> {
    return this.tokens.revokeInvitation(id);
  }

  createRecovery(actorId: string, userId: string): Promise<SecretLinkResponse> {
    return this.tokens.createRecovery(actorId, userId);
  }

  redeemRecovery(token: unknown, password: unknown, rateLimitKey: string): Promise<void> {
    return this.tokens.redeemRecovery(token, password, rateLimitKey);
  }

  revokeRecovery(id: string): Promise<void> {
    return this.tokens.revokeRecovery(id);
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
  if (!value || value.length > 128 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new InvalidAccessInputError();
  }
}
