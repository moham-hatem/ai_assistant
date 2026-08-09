import type { AuthRole } from '../../shared/contracts/auth.ts';
import type { AccessUserSummary } from '../../shared/contracts/access-management.ts';
import type { AuthInvitation, AuthRecovery, AuthUser } from './domain.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import type { SecurityAuditSink } from '../modules/security-audit/repository.ts';

export interface CreateInvitationRecord {
  createdAt: string;
  createdByUserId: string;
  displayName: string;
  email: string;
  expiresAt: string;
  id: string;
  roles: AuthRole[];
  tokenHash: string;
}

export interface CreateRecoveryRecord {
  createdAt: string;
  createdByUserId: string;
  expiresAt: string;
  id: string;
  tokenHash: string;
  userId: string;
}

export interface AccessRepository {
  enqueueSecurityAudit?(command: SecurityAuditCommand): Promise<void>;
  flushSecurityAuditOutbox?(sink: SecurityAuditSink): Promise<number>;
  createInvitation(record: CreateInvitationRecord, audit?: SecurityAuditCommand): Promise<AuthInvitation>;
  createRecovery(record: CreateRecoveryRecord, audit?: SecurityAuditCommand): Promise<AuthRecovery>;
  findInvitationByTokenHash(tokenHash: string): Promise<AuthInvitation | undefined>;
  findRecoveryByTokenHash(tokenHash: string): Promise<AuthRecovery | undefined>;
  listUsers(afterId: string | undefined, limit: number): Promise<AccessUserSummary[]>;
  redeemInvitation(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
    audit?: (user: AuthUser) => readonly SecurityAuditCommand[],
  ): Promise<AuthUser | undefined>;
  redeemRecovery(
    tokenHash: string,
    passwordHash: string,
    timestamp: string,
    audit?: (user: AuthUser) => readonly SecurityAuditCommand[],
  ): Promise<AuthUser | undefined>;
  revokeInvitation(id: string, timestamp: string, audit?: SecurityAuditCommand): Promise<boolean>;
  revokeRecovery(id: string, timestamp: string, audit?: SecurityAuditCommand): Promise<boolean>;
  setUserEnabled(
    actorId: string,
    userId: string,
    enabled: boolean,
    timestamp: string,
    audit?: readonly SecurityAuditCommand[],
  ): Promise<AuthUser>;
  updateUserAccess(command: {
    actorId: string;
    displayName: string;
    roles: AuthRole[];
    timestamp: string;
    userId: string;
  }, audit?: readonly SecurityAuditCommand[]): Promise<AuthUser>;
}

export class AccessUserNotFoundError extends Error {}
export class AccessLockoutError extends Error {}
export class AccessConflictError extends Error {}
