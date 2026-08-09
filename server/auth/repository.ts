import type { AuthRole } from '../../shared/contracts/auth.ts';
import type { AuthSession, AuthUser } from './domain.ts';

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
  saveSession(session: AuthSession): Promise<void>;
  findSession(tokenHash: string): Promise<AuthSession | undefined>;
  touchSession(tokenHash: string, lastSeenAt: string, idleExpiresAt: string): Promise<boolean>;
  revokeSession(tokenHash: string, revokedAt: string): Promise<void>;
  revokeAllUserSessions(userId: string, revokedAt: string): Promise<void>;
  updateUserSecurity(command: SaveUserCommand): Promise<AuthUser>;
}

export class DuplicateAuthUserError extends Error {}
export class AuthUserNotFoundError extends Error {}
