import type { SecretLinkResponse } from '../../shared/contracts/access-management.ts';
import { AccessAuditEmitter } from './access-audit.ts';
import {
  AccessUserNotFoundError,
  type AccessRepository,
} from './access-repository.ts';
import { AccessTokenRejectedError, InvalidAccessInputError } from './access-errors.ts';
import type { AccessRedemptionService } from './access-redemption-service.ts';
import {
  type AccessTokenServiceOptions,
  isAccessId,
  requireAccessId,
  requireFactoryToken,
  secretLink,
} from './access-token-helpers.ts';
import { hashSessionToken } from './token.ts';

export class RecoveryService {
  private readonly repository: AccessRepository;
  private readonly redemption: AccessRedemptionService;
  private readonly audit: AccessAuditEmitter;
  private readonly options: AccessTokenServiceOptions;
  private readonly now: () => Date;
  private readonly tokenFactory: () => string;
  private readonly idFactory: () => string;

  constructor(
    repository: AccessRepository,
    redemption: AccessRedemptionService,
    audit: AccessAuditEmitter,
    options: AccessTokenServiceOptions,
    now: () => Date,
    tokenFactory: () => string,
    idFactory: () => string,
  ) {
    this.repository = repository;
    this.redemption = redemption;
    this.audit = audit;
    this.options = options;
    this.now = now;
    this.tokenFactory = tokenFactory;
    this.idFactory = idFactory;
  }

  async create(actorId: string, userId: string, requestId: string): Promise<SecretLinkResponse> {
    requireAccessId(actorId);
    if (!isAccessId(userId)) {
      await this.audit.durableDenied(
        'access.recovery_created', requestId, actorId, null,
        { reason: 'invalid_request' },
      );
      throw new InvalidAccessInputError();
    }
    const token = requireFactoryToken(this.tokenFactory);
    const now = this.now();
    const timestamp = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.options.recoveryTtlMs).toISOString();
    const id = this.idFactory();
    try {
      await this.repository.createRecovery({
        createdAt: timestamp,
        createdByUserId: actorId,
        expiresAt,
        id,
        tokenHash: hashSessionToken(token),
        userId,
      }, this.audit.enabled ? (result) => {
        const events = [this.audit.success(
          'access.recovery_created', requestId, timestamp, actorId,
          { id, type: 'recovery' },
        )!];
        for (const siblingId of result.revokedRecoveryIds) events.push(this.audit.success(
          'access.recovery_revoked', requestId, timestamp, actorId,
          { id: siblingId, type: 'recovery' }, { reason: 'superseded' },
        )!);
        return events;
      } : undefined);
    } catch (error) {
      await this.audit.bestEffort(
        'access.recovery_created',
        error instanceof AccessUserNotFoundError ? 'denied' : 'failure',
        requestId,
        actorId,
        { id, type: 'recovery' },
        { reason: error instanceof AccessUserNotFoundError ? 'not_found' : 'storage_failure' },
      );
      throw error;
    }
    await this.audit.flush(this.repository);
    return secretLink(
      this.options.publicOrigin, 'password-recovery', 'recovery', token, id, expiresAt,
    );
  }

  async redeem(
    token: unknown,
    password: unknown,
    rateLimitKey: string,
    requestId: string,
  ): Promise<void> {
    await this.redemption.redeem(
      'access.recovery_redeemed', token, password, rateLimitKey, requestId,
      (tokenHash, passwordHash, timestamp) => this.repository.redeemRecovery(
        tokenHash,
        passwordHash,
        timestamp,
        this.audit.enabled ? (user, revokedRecoveryIds, sessionCount) => {
          const events = [this.audit.success(
            'access.recovery_redeemed', requestId, timestamp, null,
            { id: user.id, type: 'user' },
          )!,
          this.audit.success(
            'access.user_sessions_revoked', requestId, timestamp, null,
            { id: user.id, type: 'user' }, { reason: 'recovery_redeemed', sessionCount },
          )!,
          ];
          for (const id of revokedRecoveryIds) events.push(this.audit.success(
            'access.recovery_revoked', requestId, timestamp, null,
            { id, type: 'recovery' }, { reason: 'sibling_redeemed' },
          )!);
          return events;
        } : undefined,
      ),
    );
  }

  async revoke(actorId: string, id: string, requestId: string): Promise<void> {
    requireAccessId(actorId);
    if (!isAccessId(id)) {
      await this.audit.durableDenied(
        'access.recovery_revoked', requestId, actorId, null,
        { reason: 'invalid_request' },
      );
      throw new InvalidAccessInputError();
    }
    const timestamp = this.now().toISOString();
    try {
      const revoked = await this.repository.revokeRecovery(
        id,
        timestamp,
        this.audit.success(
          'access.recovery_revoked', requestId, timestamp, actorId,
          { id, type: 'recovery' },
        ),
      );
      if (!revoked) throw new AccessTokenRejectedError();
    } catch (error) {
      await this.audit.bestEffort(
        'access.recovery_revoked',
        error instanceof AccessTokenRejectedError ? 'denied' : 'failure',
        requestId,
        actorId,
        { id, type: 'recovery' },
        { reason: error instanceof AccessTokenRejectedError ? 'invalid_or_expired' : 'storage_failure' },
      );
      throw error;
    }
    await this.audit.flush(this.repository);
  }
}
