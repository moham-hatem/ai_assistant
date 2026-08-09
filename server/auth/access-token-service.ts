import { randomUUID } from 'node:crypto';
import type { SecretLinkResponse } from '../../shared/contracts/access-management.ts';
import { AccessAuditEmitter } from './access-audit.ts';
import type { AccessRepository } from './access-repository.ts';
import { AccessRedemptionService } from './access-redemption-service.ts';
import { InvitationService } from './invitation-service.ts';
import type { PasswordHasher } from './password.ts';
import type { LoginRateLimiter } from './rate-limit.ts';
import { RecoveryService } from './recovery-service.ts';
import { createSessionToken } from './token.ts';
import type { AccessTokenServiceOptions } from './access-token-helpers.ts';

export type { AccessTokenServiceOptions } from './access-token-helpers.ts';

export class AccessTokenService {
  private readonly invitations: InvitationService;
  private readonly recoveries: RecoveryService;

  constructor(
    repository: AccessRepository,
    passwords: PasswordHasher,
    rateLimiter: LoginRateLimiter,
    options: AccessTokenServiceOptions,
    now: () => Date = () => new Date(),
    tokenFactory: () => string = createSessionToken,
    idFactory: () => string = randomUUID,
    audit: AccessAuditEmitter = new AccessAuditEmitter(),
  ) {
    if (options.invitationTtlMs < 1 || options.recoveryTtlMs < 1) {
      throw new Error('Access token TTLs must be positive.');
    }
    if (new URL(options.publicOrigin).origin !== options.publicOrigin) {
      throw new Error('Access links require a canonical public origin.');
    }
    const redemption = new AccessRedemptionService(
      repository, passwords, rateLimiter, now, audit,
    );
    this.invitations = new InvitationService(
      repository, redemption, audit, options, now, tokenFactory, idFactory,
    );
    this.recoveries = new RecoveryService(
      repository, redemption, audit, options, now, tokenFactory, idFactory,
    );
  }

  createInvitation(
    actorId: string,
    input: { displayName: unknown; email: unknown; roles: unknown },
    requestId: string = randomUUID(),
  ): Promise<SecretLinkResponse> {
    return this.invitations.create(actorId, input, requestId);
  }

  redeemInvitation(
    token: unknown,
    password: unknown,
    rateLimitKey: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    return this.invitations.redeem(token, password, rateLimitKey, requestId);
  }

  revokeInvitation(actorId: string, id: string, requestId: string = randomUUID()): Promise<void> {
    return this.invitations.revoke(actorId, id, requestId);
  }

  createRecovery(
    actorId: string,
    userId: string,
    requestId: string = randomUUID(),
  ): Promise<SecretLinkResponse> {
    return this.recoveries.create(actorId, userId, requestId);
  }

  redeemRecovery(
    token: unknown,
    password: unknown,
    rateLimitKey: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    return this.recoveries.redeem(token, password, rateLimitKey, requestId);
  }

  revokeRecovery(actorId: string, id: string, requestId: string = randomUUID()): Promise<void> {
    return this.recoveries.revoke(actorId, id, requestId);
  }
}
