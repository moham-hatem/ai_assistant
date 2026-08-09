import { createHash, randomUUID } from 'node:crypto';
import type { SecretLinkResponse } from '../../shared/contracts/access-management.ts';
import type { AccessRepository } from './access-repository.ts';
import {
  AccessRateLimitError,
  AccessTokenRejectedError,
  InvalidAccessInputError,
} from './access-errors.ts';
import { isAuthRole, normalizeDisplayName, normalizeRoles } from './domain.ts';
import type { PasswordHasher } from './password.ts';
import type { LoginRateLimiter } from './rate-limit.ts';
import { normalizeEmail } from './service.ts';
import { createSessionToken, hashSessionToken } from './token.ts';

const SECRET_WARNING = 'This link is a secret and will not be shown again.' as const;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface AccessTokenServiceOptions {
  invitationTtlMs: number;
  publicOrigin: string;
  recoveryTtlMs: number;
}

export class AccessTokenService {
  private readonly repository: AccessRepository;
  private readonly passwords: PasswordHasher;
  private readonly rateLimiter: LoginRateLimiter;
  private readonly options: AccessTokenServiceOptions;
  private readonly now: () => Date;
  private readonly tokenFactory: () => string;
  private readonly idFactory: () => string;

  constructor(
    repository: AccessRepository,
    passwords: PasswordHasher,
    rateLimiter: LoginRateLimiter,
    options: AccessTokenServiceOptions,
    now: () => Date = () => new Date(),
    tokenFactory: () => string = createSessionToken,
    idFactory: () => string = randomUUID,
  ) {
    if (options.invitationTtlMs < 1 || options.recoveryTtlMs < 1) {
      throw new Error('Access token TTLs must be positive.');
    }
    if (new URL(options.publicOrigin).origin !== options.publicOrigin) {
      throw new Error('Access links require a canonical public origin.');
    }
    this.repository = repository;
    this.passwords = passwords;
    this.rateLimiter = rateLimiter;
    this.options = options;
    this.now = now;
    this.tokenFactory = tokenFactory;
    this.idFactory = idFactory;
  }

  async createInvitation(
    actorId: string,
    input: { displayName: unknown; email: unknown; roles: unknown },
  ): Promise<SecretLinkResponse> {
    requireId(actorId);
    const displayName = normalizeDisplayName(input.displayName);
    const email = normalizeEmail(input.email);
    const roles = parseRoles(input.roles);
    if (!displayName || !email || !roles) throw new InvalidAccessInputError();
    const token = this.requireFactoryToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.options.invitationTtlMs).toISOString();
    const invitation = await this.repository.createInvitation({
      createdAt: now.toISOString(),
      createdByUserId: actorId,
      displayName,
      email,
      expiresAt,
      id: this.idFactory(),
      roles,
      tokenHash: hashSessionToken(token),
    });
    return {
      expiresAt,
      id: invitation.id,
      link: `${this.options.publicOrigin}/#/password-setup?invitation=${encodeURIComponent(token)}`,
      warning: SECRET_WARNING,
    };
  }

  async redeemInvitation(tokenValue: unknown, passwordValue: unknown, rateLimitKey: string): Promise<void> {
    const token = parseToken(tokenValue);
    await this.assertRedemptionAllowed(rateLimitKey);
    const passwordHash = await this.hashRedemptionPassword(passwordValue, rateLimitKey);
    const user = token
      ? await this.repository.redeemInvitation(
        hashSessionToken(token), passwordHash, this.now().toISOString(),
      )
      : undefined;
    if (!user) {
      await this.recordRedemptionFailure(rateLimitKey);
      throw new AccessTokenRejectedError();
    }
    await this.rateLimiter.reset(this.redemptionKey(rateLimitKey));
  }

  async revokeInvitation(id: string): Promise<void> {
    requireId(id);
    if (!await this.repository.revokeInvitation(id, this.now().toISOString())) {
      throw new AccessTokenRejectedError();
    }
  }

  async createRecovery(actorId: string, userId: string): Promise<SecretLinkResponse> {
    requireId(actorId);
    requireId(userId);
    const token = this.requireFactoryToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.options.recoveryTtlMs).toISOString();
    const recovery = await this.repository.createRecovery({
      createdAt: now.toISOString(),
      createdByUserId: actorId,
      expiresAt,
      id: this.idFactory(),
      tokenHash: hashSessionToken(token),
      userId,
    });
    return {
      expiresAt,
      id: recovery.id,
      link: `${this.options.publicOrigin}/#/password-recovery?recovery=${encodeURIComponent(token)}`,
      warning: SECRET_WARNING,
    };
  }

  async redeemRecovery(tokenValue: unknown, passwordValue: unknown, rateLimitKey: string): Promise<void> {
    const token = parseToken(tokenValue);
    await this.assertRedemptionAllowed(rateLimitKey);
    const passwordHash = await this.hashRedemptionPassword(passwordValue, rateLimitKey);
    const redeemed = token && await this.repository.redeemRecovery(
      hashSessionToken(token), passwordHash, this.now().toISOString(),
    );
    if (!redeemed) {
      await this.recordRedemptionFailure(rateLimitKey);
      throw new AccessTokenRejectedError();
    }
    await this.rateLimiter.reset(this.redemptionKey(rateLimitKey));
  }

  async revokeRecovery(id: string): Promise<void> {
    requireId(id);
    if (!await this.repository.revokeRecovery(id, this.now().toISOString())) {
      throw new AccessTokenRejectedError();
    }
  }

  private async hashRedemptionPassword(
    passwordValue: unknown,
    rateLimitKey: string,
  ): Promise<string> {
    if (typeof passwordValue !== 'string') {
      await this.recordRedemptionFailure(rateLimitKey);
      throw new InvalidAccessInputError();
    }
    try {
      return await this.passwords.hash(passwordValue);
    } catch (error) {
      await this.recordRedemptionFailure(rateLimitKey);
      throw error;
    }
  }

  private requireFactoryToken(): string {
    const token = this.tokenFactory();
    if (!TOKEN_PATTERN.test(token)) throw new Error('Access token factory returned an unsafe token.');
    return token;
  }

  private redemptionKey(rateLimitKey: string): string {
    return createHash('sha256')
      .update(rateLimitKey.slice(0, 256), 'utf8')
      .digest('hex');
  }

  private async assertRedemptionAllowed(rateLimitKey: string): Promise<void> {
    const decision = await this.rateLimiter.check(
      this.redemptionKey(rateLimitKey), this.now().getTime(),
    );
    if (!decision.allowed) throw new AccessRateLimitError(decision.retryAfterSeconds);
  }

  private async recordRedemptionFailure(rateLimitKey: string): Promise<void> {
    const decision = await this.rateLimiter.recordFailure(
      this.redemptionKey(rateLimitKey), this.now().getTime(),
    );
    if (!decision.allowed) throw new AccessRateLimitError(decision.retryAfterSeconds);
  }
}

function parseRoles(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4 || !value.every(isAuthRole)) {
    return undefined;
  }
  return normalizeRoles(value);
}

function parseToken(value: unknown): string | undefined {
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : undefined;
}

function requireId(value: string): void {
  if (!value || value.length > 128 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new InvalidAccessInputError();
  }
}
