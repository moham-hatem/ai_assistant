import type { DatabaseSync } from 'node:sqlite';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import type {
  CreateInvitationRecord,
  CreateRecoveryRecord,
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

  createRecovery(record: CreateRecoveryRecord, audit?: SecurityAuditCommand): Promise<AuthRecovery> {
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
