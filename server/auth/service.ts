import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthPrincipal, AuthRole } from '../../shared/contracts/auth.ts';
import {
  isAuthRole,
  normalizeDisplayName,
  normalizeRoles,
  toPrincipal,
} from './domain.ts';
import type { PasswordHasher } from './password.ts';
import type { LoginRateLimiter } from './rate-limit.ts';
import type { AuthRepository } from './repository.ts';
import { createSessionToken, hashSessionToken } from './token.ts';
import type { SecurityAuditService } from '../modules/security-audit/service.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';

export interface AuthServiceOptions {
  absoluteTtlMs: number;
  idleTtlMs: number;
}

export interface LoginCommand {
  email: unknown;
  password: unknown;
  previousSessionToken?: string;
  rateLimitKey: string;
  requestId?: string;
}

export interface LoginResult {
  principal: AuthPrincipal;
  sessionToken: string;
}

export class InvalidCredentialsError extends Error {}
export class InvalidAuthInputError extends Error {}
export class TooManyLoginAttemptsError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Too many login attempts.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AuthService {
  private readonly repository: AuthRepository;
  private readonly passwords: PasswordHasher;
  private readonly rateLimiter: LoginRateLimiter;
  private readonly dummyPasswordHash: string;
  private readonly options: AuthServiceOptions;
  private readonly now: () => Date;
  private readonly tokenFactory: () => string;
  private readonly audit?: SecurityAuditService;

  constructor(
    repository: AuthRepository,
    passwords: PasswordHasher,
    rateLimiter: LoginRateLimiter,
    dummyPasswordHash: string,
    options: AuthServiceOptions,
    now: () => Date = () => new Date(),
    tokenFactory: () => string = createSessionToken,
    audit?: SecurityAuditService,
  ) {
    if (options.idleTtlMs < 1 || options.absoluteTtlMs < options.idleTtlMs) {
      throw new Error('Absolute session TTL must be at least the idle TTL.');
    }
    this.repository = repository;
    this.passwords = passwords;
    this.rateLimiter = rateLimiter;
    this.dummyPasswordHash = dummyPasswordHash;
    this.options = options;
    this.now = now;
    this.tokenFactory = tokenFactory;
    this.audit = audit;
  }

  async login(command: LoginCommand): Promise<LoginResult> {
    const requestId = command.requestId ?? randomUUID();
    const email = normalizeEmail(command.email);
    const password = typeof command.password === 'string' ? command.password : '';
    const rateKey = createHash('sha256')
      .update(`${command.rateLimitKey}\0${email}`, 'utf8')
      .digest('hex');
    const now = this.now();
    const decision = await this.rateLimiter.check(rateKey, now.getTime());
    if (!decision.allowed) {
      await this.audit?.bestEffort(authEvent('auth.login', 'denied', requestId, null, null, { reason: 'rate_limited' }));
      throw new TooManyLoginAttemptsError(decision.retryAfterSeconds);
    }

    const user = email ? await this.repository.findUserByEmail(email) : undefined;
    const valid = await this.passwords.verify(password, user?.passwordHash ?? this.dummyPasswordHash);
    if (!user || !valid || !user.enabled) {
      if (user && !user.enabled) {
        await this.repository.revokeAllUserSessions(user.id, now.toISOString());
      }
      const failure = await this.rateLimiter.recordFailure(rateKey, now.getTime());
      if (!failure.allowed) {
        await this.audit?.bestEffort(authEvent('auth.login', 'denied', requestId, null, null, { reason: 'rate_limited' }));
        throw new TooManyLoginAttemptsError(failure.retryAfterSeconds);
      }
      await this.audit?.bestEffort(authEvent('auth.login', 'failure', requestId, null, null, { reason: 'invalid_credentials' }));
      throw new InvalidCredentialsError('Invalid email or password.');
    }

    if (command.previousSessionToken) {
      await this.repository.revokeSession(
        hashSessionToken(command.previousSessionToken),
        now.toISOString(),
      );
    }
    const sessionToken = this.tokenFactory();
    const absoluteExpiresAt = now.getTime() + this.options.absoluteTtlMs;
    const audit = this.audit ? withIdentity(
      authEvent('auth.login', 'success', requestId, user.id, user.id, {}), now.toISOString(),
    ) : undefined;
    await this.repository.saveSession({
      absoluteExpiresAt: new Date(absoluteExpiresAt).toISOString(),
      createdAt: now.toISOString(),
      idleExpiresAt: new Date(Math.min(
        now.getTime() + this.options.idleTtlMs,
        absoluteExpiresAt,
      )).toISOString(),
      lastSeenAt: now.toISOString(),
      revokedAt: null,
      tokenHash: hashSessionToken(sessionToken),
      userId: user.id,
    }, audit);
    await this.flushAudit();
    await this.rateLimiter.reset(rateKey);
    return { principal: toPrincipal(user), sessionToken };
  }

  async getPrincipal(sessionToken: string | undefined, requestId: string = randomUUID()): Promise<AuthPrincipal | null> {
    if (!sessionToken || sessionToken.length > 512) return null;
    const tokenHash = hashSessionToken(sessionToken);
    const session = await this.repository.findSession(tokenHash);
    if (!session || session.revokedAt) return null;
    const now = this.now();
    const nowMs = now.getTime();
    const absoluteMs = Date.parse(session.absoluteExpiresAt);
    if (Date.parse(session.idleExpiresAt) <= nowMs || absoluteMs <= nowMs) {
      await this.repository.revokeSession(tokenHash, now.toISOString(), this.audit ? withIdentity(
        authEvent('auth.session_revoked', 'success', requestId, null, session.userId, { reason: 'expired' }),
        now.toISOString(),
      ) : undefined);
      await this.flushAudit();
      return null;
    }
    const idleExpiresAt = new Date(Math.min(nowMs + this.options.idleTtlMs, absoluteMs)).toISOString();
    if (!await this.repository.touchSession(tokenHash, now.toISOString(), idleExpiresAt)) return null;
    const user = await this.repository.findUserById(session.userId);
    if (!user || !user.enabled) {
      const reason = user ? 'disabled_user' : 'missing_user';
      const audit = this.audit ? withIdentity(
        authEvent('auth.session_revoked', 'success', requestId, null, session.userId, { reason }),
        now.toISOString(),
      ) : undefined;
      if (user) {
        await this.repository.revokeAllUserSessions(user.id, now.toISOString(), audit);
      } else {
        await this.repository.revokeSession(tokenHash, now.toISOString(), audit);
      }
      await this.flushAudit();
      return null;
    }
    return toPrincipal(user);
  }

  async logout(sessionToken: string | undefined, requestId: string = randomUUID()): Promise<void> {
    if (!sessionToken || sessionToken.length > 512) return;
    const tokenHash = hashSessionToken(sessionToken);
    const session = await this.repository.findSession(tokenHash);
    const at = this.now().toISOString();
    const audit = this.audit && session ? withIdentity(
      authEvent('auth.logout', 'success', requestId, session.userId, session.userId, {}), at,
    ) : undefined;
    await this.repository.revokeSession(tokenHash, at, audit);
    await this.flushAudit();
  }

  async revokeAll(userId: string): Promise<void> {
    const requestId = randomUUID();
    const at = this.now().toISOString();
    await this.repository.revokeAllUserSessions(userId, at, this.audit ? withIdentity(
      authEvent('auth.session_revoked', 'success', requestId, null, userId, { reason: 'administrative' }),
      at,
    ) : undefined);
    await this.flushAudit();
  }

  async updateUserSecurity(input: {
    displayName: unknown;
    email: unknown;
    password: unknown;
    roles: readonly unknown[];
    userId: string;
  }): Promise<AuthPrincipal> {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    if (!displayName || !email || typeof input.password !== 'string' ||
        !Array.isArray(input.roles) || !input.roles.every(isAuthRole)) {
      throw new InvalidAuthInputError('Invalid user security input.');
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.repository.updateUserSecurity({
      displayName,
      email,
      id: input.userId,
      passwordHash,
      roles: normalizeRoles(input.roles as AuthRole[]),
      timestamp: this.now().toISOString(),
    });
    return toPrincipal(user);
  }

  private async flushAudit(): Promise<void> {
    if (this.audit && this.repository.flushSecurityAuditOutbox) {
      await this.repository.flushSecurityAuditOutbox(this.audit);
    }
  }
}

export async function createAuthService(
  repository: AuthRepository,
  passwords: PasswordHasher,
  rateLimiter: LoginRateLimiter,
  options: AuthServiceOptions,
  dependencies: { audit?: SecurityAuditService; now?: () => Date; tokenFactory?: () => string } = {},
): Promise<AuthService> {
  const dummyPasswordHash = await passwords.hash(randomBytes(32).toString('base64url'));
  return new AuthService(
    repository,
    passwords,
    rateLimiter,
    dummyPasswordHash,
    options,
    dependencies.now,
    dependencies.tokenFactory,
    dependencies.audit,
  );
}

function authEvent(
  action: 'auth.login' | 'auth.logout' | 'auth.session_revoked',
  outcome: 'denied' | 'failure' | 'success',
  requestId: string,
  actorUserId: string | null,
  subjectUserId: string | null,
  metadata: Record<string, string>,
): Omit<SecurityAuditCommand, 'id' | 'timestamp'> {
  return {
    action, actorUserId, category: 'authentication', metadata, outcome, requestId,
    subjectId: subjectUserId, subjectType: subjectUserId ? 'user' : null,
  };
}

function withIdentity(
  command: Omit<SecurityAuditCommand, 'id' | 'timestamp'>,
  timestamp: string,
): SecurityAuditCommand {
  return { ...command, id: randomUUID(), timestamp };
}

export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 320 || /[\r\n\0]/u.test(value)) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 254) return undefined;
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[1].startsWith('.') ||
      parts[1].endsWith('.') || !parts[1].includes('.')) return undefined;
  return normalized;
}

export function newAuthUserId(): string {
  return randomUUID();
}
