import type { DatabaseSync } from 'node:sqlite';
import type { AccessInvitationSummary } from '../../shared/contracts/access-management.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import type {
  CreateInvitationRecord,
  CreateRecoveryRecord,
  RecoveryIssueMutationResult,
} from './access-repository.ts';
import type { AuthInvitation, AuthRecovery, AuthUser } from './domain.ts';
import { SqliteInvitationRepository } from './sqlite-invitation-repository.ts';
import { SqliteRecoveryRepository } from './sqlite-recovery-repository.ts';

export class SqliteAccessTokenRepository {
  private readonly invitations: SqliteInvitationRepository;
  private readonly recoveries: SqliteRecoveryRepository;

  constructor(database: DatabaseSync) {
    this.invitations = new SqliteInvitationRepository(database);
    this.recoveries = new SqliteRecoveryRepository(database);
  }

  createInvitation(
    record: CreateInvitationRecord,
    audit?: SecurityAuditCommand,
  ): Promise<AuthInvitation> {
    return this.invitations.create(record, audit);
  }

  findInvitation(tokenHash: string): Promise<AuthInvitation | undefined> {
    return this.invitations.find(tokenHash);
  }

  listInvitations(
    afterId: string | undefined,
    limit: number,
    timestamp: string,
  ): Promise<AccessInvitationSummary[]> {
    return Promise.resolve(this.invitations.list(afterId, limit, timestamp));
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
    return this.invitations.redeem(tokenHash, passwordHash, timestamp, audit);
  }

  revokeInvitation(
    id: string,
    timestamp: string,
    audit?: SecurityAuditCommand,
  ): Promise<boolean> {
    return this.invitations.revoke(id, timestamp, audit);
  }

  createRecovery(
    record: CreateRecoveryRecord,
    audit?: (result: RecoveryIssueMutationResult) => readonly SecurityAuditCommand[],
  ): Promise<RecoveryIssueMutationResult> {
    return this.recoveries.create(record, audit);
  }

  findRecovery(tokenHash: string): Promise<AuthRecovery | undefined> {
    return this.recoveries.find(tokenHash);
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
    return this.recoveries.redeem(tokenHash, passwordHash, timestamp, audit);
  }

  revokeRecovery(id: string, timestamp: string, audit?: SecurityAuditCommand): Promise<boolean> {
    return this.recoveries.revoke(id, timestamp, audit);
  }
}
