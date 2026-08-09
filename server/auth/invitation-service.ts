import type { SecretLinkResponse } from '../../shared/contracts/access-management.ts';
import { AccessAuditEmitter } from './access-audit.ts';
import {
  AccessConflictError,
  type AccessRepository,
} from './access-repository.ts';
import { AccessTokenRejectedError, InvalidAccessInputError } from './access-errors.ts';
import type { AccessRedemptionService } from './access-redemption-service.ts';
import {
  type AccessTokenServiceOptions,
  requireAccessId,
  requireFactoryToken,
  secretLink,
} from './access-token-helpers.ts';
import { isAuthRole, normalizeDisplayName, normalizeRoles } from './domain.ts';
import { normalizeEmail } from './service.ts';
import { hashSessionToken } from './token.ts';

export class InvitationService {
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

  async create(
    actorId: string,
    input: { displayName: unknown; email: unknown; roles: unknown },
    requestId: string,
  ): Promise<SecretLinkResponse> {
    requireAccessId(actorId);
    const displayName = normalizeDisplayName(input.displayName);
    const email = normalizeEmail(input.email);
    const roles = parseRoles(input.roles);
    if (!displayName || !email || !roles) throw new InvalidAccessInputError();
    const token = requireFactoryToken(this.tokenFactory);
    const now = this.now();
    const timestamp = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.options.invitationTtlMs).toISOString();
    const id = this.idFactory();
    try {
      await this.repository.createInvitation({
        createdAt: timestamp,
        createdByUserId: actorId,
        displayName,
        email,
        expiresAt,
        id,
        roles,
        tokenHash: hashSessionToken(token),
      }, this.audit.success(
        'access.invitation_created', requestId, timestamp, actorId,
        { id, type: 'invitation' }, { roleCount: roles.length },
      ));
    } catch (error) {
      await this.audit.bestEffort(
        'access.invitation_created',
        error instanceof AccessConflictError ? 'denied' : 'failure',
        requestId,
        actorId,
        { id, type: 'invitation' },
        { reason: error instanceof AccessConflictError ? 'conflict' : 'storage_failure', roleCount: roles.length },
      );
      throw error;
    }
    await this.audit.flush(this.repository);
    return secretLink(
      this.options.publicOrigin, 'password-setup', 'invitation', token, id, expiresAt,
    );
  }

  async redeem(
    token: unknown,
    password: unknown,
    rateLimitKey: string,
    requestId: string,
  ): Promise<void> {
    await this.redemption.redeem(
      'access.invitation_redeemed', token, password, rateLimitKey, requestId,
      (tokenHash, passwordHash, timestamp) => this.repository.redeemInvitation(
        tokenHash,
        passwordHash,
        timestamp,
        this.audit.enabled ? (user) => [this.audit.success(
          'access.invitation_redeemed', requestId, timestamp, null,
          { id: user.id, type: 'user' }, { roleCount: user.roles.length },
        )!] : undefined,
      ),
    );
  }

  async revoke(actorId: string, id: string, requestId: string): Promise<void> {
    requireAccessId(actorId);
    requireAccessId(id);
    const timestamp = this.now().toISOString();
    try {
      const revoked = await this.repository.revokeInvitation(
        id,
        timestamp,
        this.audit.success(
          'access.invitation_revoked', requestId, timestamp, actorId,
          { id, type: 'invitation' },
        ),
      );
      if (!revoked) throw new AccessTokenRejectedError();
    } catch (error) {
      await this.audit.bestEffort(
        'access.invitation_revoked',
        error instanceof AccessTokenRejectedError ? 'denied' : 'failure',
        requestId,
        actorId,
        { id, type: 'invitation' },
        { reason: error instanceof AccessTokenRejectedError ? 'invalid_or_expired' : 'storage_failure' },
      );
      throw error;
    }
    await this.audit.flush(this.repository);
  }
}

function parseRoles(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4 || !value.every(isAuthRole)) {
    return undefined;
  }
  return normalizeRoles(value);
}
