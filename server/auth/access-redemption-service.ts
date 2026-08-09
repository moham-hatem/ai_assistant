import { createHash } from 'node:crypto';
import type { AuthUser } from './domain.ts';
import { AccessAuditEmitter, type AccessAuditAction } from './access-audit.ts';
import type { AccessRepository } from './access-repository.ts';
import {
  AccessRateLimitError,
  AccessTokenRejectedError,
  InvalidAccessInputError,
} from './access-errors.ts';
import { parseAccessToken } from './access-token-helpers.ts';
import { PasswordPolicyError, type PasswordHasher } from './password.ts';
import type { LoginRateLimiter } from './rate-limit.ts';
import { hashSessionToken } from './token.ts';

type RedemptionAction = Extract<
  AccessAuditAction,
  'access.invitation_redeemed' | 'access.recovery_redeemed'
>;

export class AccessRedemptionService {
  private readonly repository: AccessRepository;
  private readonly passwords: PasswordHasher;
  private readonly rateLimiter: LoginRateLimiter;
  private readonly now: () => Date;
  private readonly audit: AccessAuditEmitter;

  constructor(
    repository: AccessRepository,
    passwords: PasswordHasher,
    rateLimiter: LoginRateLimiter,
    now: () => Date,
    audit: AccessAuditEmitter,
  ) {
    this.repository = repository;
    this.passwords = passwords;
    this.rateLimiter = rateLimiter;
    this.now = now;
    this.audit = audit;
  }

  async redeem(
    action: RedemptionAction,
    tokenValue: unknown,
    passwordValue: unknown,
    rateLimitKey: string,
    requestId: string,
    operation: (
      tokenHash: string,
      passwordHash: string,
      timestamp: string,
    ) => Promise<AuthUser | undefined>,
  ): Promise<AuthUser> {
    let user: AuthUser | undefined;
    try {
      const token = parseAccessToken(tokenValue);
      await this.assertAllowed(rateLimitKey);
      const passwordHash = await this.hashPassword(passwordValue, rateLimitKey);
      user = token ? await operation(
        hashSessionToken(token), passwordHash, this.now().toISOString(),
      ) : undefined;
      if (!user) {
        await this.recordFailure(rateLimitKey);
        throw new AccessTokenRejectedError();
      }
    } catch (error) {
      const reason = error instanceof AccessRateLimitError ? 'rate_limited'
        : error instanceof AccessTokenRejectedError ? 'invalid_or_expired'
        : error instanceof InvalidAccessInputError || error instanceof PasswordPolicyError
          ? 'invalid_request'
        : 'storage_failure';
      const expected = error instanceof AccessRateLimitError
        || error instanceof AccessTokenRejectedError
        || error instanceof InvalidAccessInputError
        || error instanceof PasswordPolicyError;
      await this.audit.bestEffort(
        action,
        expected ? 'denied' : 'failure',
        requestId,
        null,
        null,
        { reason },
      );
      throw error;
    }
    await this.audit.flush(this.repository);
    await this.rateLimiter.reset(this.redemptionKey(rateLimitKey));
    return user;
  }

  private async hashPassword(password: unknown, rateLimitKey: string): Promise<string> {
    if (typeof password !== 'string') {
      await this.recordFailure(rateLimitKey);
      throw new InvalidAccessInputError();
    }
    try {
      return await this.passwords.hash(password);
    } catch (error) {
      await this.recordFailure(rateLimitKey);
      throw error;
    }
  }

  private redemptionKey(rateLimitKey: string): string {
    return createHash('sha256').update(rateLimitKey.slice(0, 256), 'utf8').digest('hex');
  }

  private async assertAllowed(rateLimitKey: string): Promise<void> {
    const decision = await this.rateLimiter.check(
      this.redemptionKey(rateLimitKey), this.now().getTime(),
    );
    if (!decision.allowed) throw new AccessRateLimitError(decision.retryAfterSeconds);
  }

  private async recordFailure(rateLimitKey: string): Promise<void> {
    const decision = await this.rateLimiter.recordFailure(
      this.redemptionKey(rateLimitKey), this.now().getTime(),
    );
    if (!decision.allowed) throw new AccessRateLimitError(decision.retryAfterSeconds);
  }
}
