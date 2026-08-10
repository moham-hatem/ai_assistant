import type { AuthRole } from '../../shared/contracts/auth.ts';
import type { AuthSession, AuthUser } from './domain.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import type { SecurityAuditSink } from '../modules/security-audit/repository.ts';

export interface SaveUserCommand {
  displayName: string;
  email: string;
  id: string;
  passwordHash: string;
  roles: AuthRole[];
  timestamp: string;
}

export interface AuthRepository {
  createUser(command: SaveUserCommand): Promise<AuthUser>;
  findUserByEmail(normalizedEmail: string): Promise<AuthUser | undefined>;
  findUserById(id: string): Promise<AuthUser | undefined>;
  saveSession(session: AuthSession, audit?: SecurityAuditCommand): Promise<void>;
  rotateSession(
    previousTokenHash: string | undefined,
    session: AuthSession,
    audit?: readonly SecurityAuditCommand[],
  ): Promise<void>;
  findSession(tokenHash: string): Promise<AuthSession | undefined>;
  touchSession(tokenHash: string, lastSeenAt: string, idleExpiresAt: string): Promise<boolean>;
  revokeSession(tokenHash: string, revokedAt: string, audit?: SecurityAuditCommand): Promise<boolean>;
  revokeAllUserSessions(
    userId: string,
    revokedAt: string,
    audit?: (sessionCount: number) => SecurityAuditCommand | undefined,
  ): Promise<number>;
  enqueueSecurityAudit?(command: SecurityAuditCommand): Promise<void>;
  flushSecurityAuditOutbox?(sink: SecurityAuditSink): Promise<number>;
  updateUserSecurity(command: SaveUserCommand): Promise<AuthUser>;
}

export class DuplicateAuthUserError extends Error {}
export class AuthUserNotFoundError extends Error {}
