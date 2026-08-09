import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AppError } from '../errors.ts';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';
import { UnavailableSecurityAuditRepository } from '../modules/security-audit/unavailable-repository.ts';
import {
  AccessConflictError,
  AccessLockoutError,
  AccessService,
  AccessUserNotFoundError,
  InvalidAccessInputError,
} from './access-service.ts';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';
import { hashSessionToken } from './token.ts';

const fastScrypt = { cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024 };
const publicOrigin = 'http://app.local.test';

test('access lifecycle writes typed minimized events with actor, subject, and request context', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  const passwords = new ScryptPasswordHasher(fastScrypt);
  const password = 'initial secure password';
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin'], password);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer'], password);
  const tokens = ['a', 'b', 'c', 'd'].map((value) => value.repeat(43));
  let id = 0;
  const access = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    () => new Date('2026-08-10T00:00:00.000Z'),
    () => tokens.shift()!,
    () => `access-${++id}`,
    audit,
  );
  const loginService = await createAuthService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { absoluteTtlMs: 60_000, idleTtlMs: 30_000 },
    { tokenFactory: () => 's'.repeat(43) },
  );

  try {
    await access.updateUser(
      'admin-1', 'user-1', { displayName: 'Renamed User', roles: undefined }, 'request-profile',
    );
    await access.updateUser(
      'admin-1', 'user-1', { displayName: undefined, roles: ['operator'] }, 'request-roles',
    );
    await access.setEnabled('admin-1', 'user-1', false, 'request-disabled');
    await access.setEnabled('admin-1', 'user-1', true, 'request-enabled');
    await loginService.login({
      email: 'user@example.test', password, rateLimitKey: 'local', requestId: 'login-session',
    });
    await access.revokeAllSessions('admin-1', 'user-1', 'request-sessions');

    const revokedInvitation = await access.createInvitation('admin-1', {
      displayName: 'Revoked Invite', email: 'revoked@example.test', roles: ['reviewer'],
    }, 'request-invitation-create-1');
    await access.revokeInvitation(
      'admin-1', revokedInvitation.id, 'request-invitation-revoke',
    );
    const redeemedInvitation = await access.createInvitation('admin-1', {
      displayName: 'Redeemed Invite', email: 'redeemed@example.test', roles: ['operator'],
    }, 'request-invitation-create-2');
    await access.redeemInvitation(
      secret(redeemedInvitation.link, 'invitation'),
      'invited secure password',
      'public-client',
      'request-invitation-redeem',
    );
    const invitedUserId = (await auth.findUserByEmail('redeemed@example.test'))!.id;

    const revokedRecovery = await access.createRecovery(
      'admin-1', 'user-1', 'request-recovery-create-1',
    );
    await access.revokeRecovery('admin-1', revokedRecovery.id, 'request-recovery-revoke');
    const redeemedRecovery = await access.createRecovery(
      'admin-1', 'user-1', 'request-recovery-create-2',
    );
    await access.redeemRecovery(
      secret(redeemedRecovery.link, 'recovery'),
      'replacement secure password',
      'public-client-2',
      'request-recovery-redeem',
    );

    const events = await audit.list({ category: 'access', limit: 100, offset: 0 });
    const actions = new Set(events.items.map((event) => event.action));
    for (const action of [
      'access.user_profile_changed',
      'access.user_roles_changed',
      'access.user_enabled',
      'access.user_disabled',
      'access.user_sessions_revoked',
      'access.invitation_created',
      'access.invitation_revoked',
      'access.invitation_redeemed',
      'access.recovery_created',
      'access.recovery_revoked',
      'access.recovery_redeemed',
    ] as const) assert.equal(actions.has(action), true, action);

    for (const requestId of [
      'request-profile', 'request-roles', 'request-disabled', 'request-enabled',
      'request-sessions', 'request-invitation-create-1', 'request-invitation-revoke',
      'request-invitation-create-2', 'request-recovery-create-1',
      'request-recovery-revoke', 'request-recovery-create-2',
    ]) {
      assert.ok(events.items.some((event) => event.requestId === requestId
        && event.actorUserId === 'admin-1'));
    }
    for (const [requestId, expectedUserId] of [
      ['request-invitation-redeem', invitedUserId],
      ['request-recovery-redeem', 'user-1'],
    ] as const) {
      const event = events.items.find((item) => item.requestId === requestId
        && item.action.endsWith('_redeemed'));
      assert.equal(event?.actorUserId, null);
      assert.equal(event?.subjectType, 'user');
      assert.equal(event?.subjectId, expectedUserId);
    }
    const serialized = JSON.stringify(events);
    for (const secretValue of [
      password,
      'admin@example.test',
      'user@example.test',
      'redeemed@example.test',
      'a'.repeat(43),
      'b'.repeat(43),
      'c'.repeat(43),
      'd'.repeat(43),
      redeemedInvitation.link,
      redeemedRecovery.link,
      hashSessionToken('d'.repeat(43)),
    ]) assert.equal(serialized.includes(secretValue), false);
  } finally {
    auth.close();
    auditRepository.close();
  }
});

test('self-lockout and last-admin failures are durable denied events without state changes', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'operator-1', 'operator@example.test', ['operator']);
  const access = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    undefined,
    undefined,
    undefined,
    audit,
  );
  try {
    await assert.rejects(
      access.setEnabled('admin-1', 'admin-1', false, 'request-self-lockout'),
      AccessLockoutError,
    );
    await assert.rejects(
      access.updateUser(
        'operator-1', 'admin-1', { displayName: undefined, roles: ['reviewer'] },
        'request-last-admin',
      ),
      AccessLockoutError,
    );
    await assert.rejects(
      access.setEnabled('admin-1', 'missing-user', false, 'request-enable-missing'),
      AccessUserNotFoundError,
    );
    await assert.rejects(
      access.revokeAllSessions('admin-1', 'missing-user', 'request-sessions-missing'),
      AccessUserNotFoundError,
    );
    const admin = await auth.findUserById('admin-1');
    assert.equal(admin?.enabled, true);
    assert.deepEqual(admin?.roles, ['admin']);
    const events = await audit.list({ category: 'access', limit: 10, offset: 0 });
    const self = events.items.find((event) => event.requestId === 'request-self-lockout');
    assert.equal(self?.action, 'access.user_disabled');
    assert.equal(self?.outcome, 'denied');
    assert.equal(self?.actorUserId, 'admin-1');
    assert.deepEqual(self?.metadata, { reason: 'self_lockout' });
    const last = events.items.find((event) => event.requestId === 'request-last-admin');
    assert.equal(last?.action, 'access.user_roles_changed');
    assert.equal(last?.outcome, 'denied');
    assert.equal(last?.actorUserId, 'operator-1');
    assert.deepEqual(last?.metadata, { reason: 'last_admin' });
    for (const requestId of ['request-enable-missing', 'request-sessions-missing']) {
      const missing = events.items.find((event) => event.requestId === requestId);
      assert.equal(missing?.outcome, 'denied');
      assert.equal(missing?.actorUserId, 'admin-1');
      assert.deepEqual(missing?.metadata, { reason: 'not_found' });
    }
  } finally {
    auth.close();
    auditRepository.close();
  }
});

test('sensitive access success commits to outbox and fails closed while audit is unavailable', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  const access = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    undefined,
    () => 'z'.repeat(43),
    () => 'unavailable-invitation',
    new SecurityAuditService(new UnavailableSecurityAuditRepository()),
  );
  try {
    await assert.rejects(access.createInvitation('admin-1', {
      displayName: 'Unavailable Invite', email: 'unavailable@example.test', roles: ['reviewer'],
    }, 'request-unavailable'), (error: unknown) => error instanceof AppError
      && error.code === 'SECURITY_AUDIT_UNAVAILABLE'
      && error.status === 503);
    assert.ok(await auth.findInvitationByTokenHash(hashSessionToken('z'.repeat(43))));
    const recoveredRepository = new SqliteSecurityAuditRepository(
      ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
    );
    try {
      const recovered = new SecurityAuditService(recoveredRepository);
      assert.equal(await auth.flushSecurityAuditOutbox(recovered), 1);
      const events = await recovered.list({ action: 'access.invitation_created', limit: 10, offset: 0 });
      assert.equal(events.items[0]?.requestId, 'request-unavailable');
    } finally {
      recoveredRepository.close();
    }
  } finally {
    auth.close();
  }
});

test('access state rolls back when its transactional audit outbox insert fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'access-audit-rollback-'));
  const databasePath = join(directory, 'auth.sqlite');
  const auth = new SqliteAuthRepository(databasePath);
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer']);
  const control = new DatabaseSync(databasePath);
  control.exec(`
    CREATE TRIGGER reject_access_audit_outbox
    BEFORE INSERT ON security_audit_outbox BEGIN
      SELECT RAISE(ABORT, 'injected audit outbox failure');
    END;
  `);
  control.close();
  const access = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    undefined,
    undefined,
    undefined,
    new SecurityAuditService(auditRepository),
  );
  try {
    await assert.rejects(
      access.updateUser(
        'admin-1', 'user-1', { displayName: '   ', roles: undefined },
        'request-invalid-outbox',
      ),
      (error: unknown) => error instanceof AppError
        && error.code === 'SECURITY_AUDIT_UNAVAILABLE'
        && error.status === 503,
    );
    assert.equal((await auth.findUserById('user-1'))?.displayName, 'user-1');
    await assert.rejects(
      access.createInvitation('admin-1', {
        displayName: 'Invalid Invite', email: 'not-an-email', roles: ['reviewer'],
      }, 'request-invalid-create-outbox'),
      (error: unknown) => error instanceof AppError
        && error.code === 'SECURITY_AUDIT_UNAVAILABLE'
        && error.status === 503,
    );
    await assert.rejects(
      access.setEnabled('admin-1', 'user-1', false, 'request-rollback'),
      /injected audit outbox failure/u,
    );
    assert.equal((await auth.findUserById('user-1'))?.enabled, true);
    const fallback = await new SecurityAuditService(auditRepository).list({
      category: 'access', limit: 10, offset: 0,
    });
    assert.equal(fallback.items[0]?.requestId, 'request-rollback');
    assert.equal(fallback.items[0]?.outcome, 'failure');
    assert.deepEqual(fallback.items[0]?.metadata, { reason: 'storage_failure' });
  } finally {
    auth.close();
    auditRepository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('no-op sensitive successes are transactional, count zero work, and do not duplicate after sink recovery', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer']);
  const access = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    undefined,
    undefined,
    undefined,
    new SecurityAuditService(new UnavailableSecurityAuditRepository()),
  );
  try {
    for (const operation of [
      () => access.updateUser(
        'admin-1', 'user-1', { displayName: 'user-1', roles: undefined }, 'noop-profile',
      ),
      () => access.setEnabled('admin-1', 'user-1', true, 'noop-enabled'),
      () => access.revokeAllSessions('admin-1', 'user-1', 'empty-sessions'),
    ]) {
      await assert.rejects(operation(), (error: unknown) => error instanceof AppError
        && error.code === 'SECURITY_AUDIT_UNAVAILABLE'
        && error.status === 503);
    }

    const recoveredRepository = new SqliteSecurityAuditRepository(
      ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
    );
    try {
      const recovered = new SecurityAuditService(recoveredRepository);
      assert.equal(await auth.flushSecurityAuditOutbox(recovered), 3);
      assert.equal(await auth.flushSecurityAuditOutbox(recovered), 0);
      const events = await recovered.list({ category: 'access', limit: 10, offset: 0 });
      assert.equal(events.total, 3);
      assert.deepEqual(
        events.items.find((event) => event.requestId === 'noop-profile')?.metadata,
        { changed: false },
      );
      assert.deepEqual(
        events.items.find((event) => event.requestId === 'noop-enabled')?.metadata,
        { changed: false },
      );
      assert.deepEqual(
        events.items.find((event) => event.requestId === 'empty-sessions')?.metadata,
        { reason: 'administrative', sessionCount: 0 },
      );
    } finally {
      recoveredRepository.close();
    }
  } finally {
    auth.close();
  }
});

test('successful redemption transactionally revokes every active sibling with one event per id', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'access-audit-siblings-'));
  const databasePath = join(directory, 'auth.sqlite');
  const auth = new SqliteAuthRepository(databasePath);
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer']);
  const tokens = ['i', 'r', 's'].map((value) => value.repeat(43));
  let nextId = 0;
  const access = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    () => new Date('2026-08-10T00:00:00.000Z'),
    () => tokens.shift()!,
    () => `token-${++nextId}`,
    new SecurityAuditService(auditRepository),
  );
  try {
    const invitation = await access.createInvitation('admin-1', {
      displayName: 'Sibling Invite', email: 'sibling@example.test', roles: ['reviewer'],
    }, 'create-current-invitation');
    const control = new DatabaseSync(databasePath);
    try {
      control.prepare(`
        INSERT INTO auth_invitations (
          id, token_hash, email, display_name, created_by_user_id, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'legacy-sibling-invitation', hashSessionToken('l'.repeat(43)),
        'sibling@example.test', 'Legacy Sibling', 'admin-1',
        '2026-08-10T00:00:00.000Z', '2026-08-10T01:00:00.000Z',
      );
      control.prepare(`
        INSERT INTO auth_invitation_roles(invitation_id, role) VALUES (?, ?)
      `).run('legacy-sibling-invitation', 'reviewer');
    } finally {
      control.close();
    }
    await access.redeemInvitation(
      secret(invitation.link, 'invitation'), 'invited secure password', 'public',
      'redeem-invitation-siblings',
    );
    assert.equal(
      (await auth.findInvitationByTokenHash(hashSessionToken('l'.repeat(43))))?.revokedAt,
      '2026-08-10T00:00:00.000Z',
    );

    const firstRecovery = await access.createRecovery('admin-1', 'user-1', 'create-recovery-1');
    const secondRecovery = await access.createRecovery('admin-1', 'user-1', 'create-recovery-2');
    await access.redeemRecovery(
      secret(secondRecovery.link, 'recovery'), 'replacement secure password', 'public-2',
      'redeem-recovery-siblings',
    );
    assert.equal(
      (await auth.findRecoveryByTokenHash(hashSessionToken(secret(firstRecovery.link, 'recovery'))))?.revokedAt,
      '2026-08-10T00:00:00.000Z',
    );

    const events = await new SecurityAuditService(auditRepository).list({
      category: 'access', limit: 50, offset: 0,
    });
    const invitationSibling = events.items.find((event) =>
      event.requestId === 'redeem-invitation-siblings'
      && event.action === 'access.invitation_revoked');
    assert.equal(invitationSibling?.subjectId, 'legacy-sibling-invitation');
    assert.equal(invitationSibling?.actorUserId, null);
    assert.deepEqual(invitationSibling?.metadata, { reason: 'sibling_redeemed' });
    const recoverySibling = events.items.find((event) =>
      event.requestId === 'redeem-recovery-siblings'
      && event.action === 'access.recovery_revoked');
    assert.equal(recoverySibling?.subjectId, firstRecovery.id);
    assert.equal(recoverySibling?.actorUserId, null);
    assert.deepEqual(recoverySibling?.metadata, { reason: 'sibling_redeemed' });
  } finally {
    auth.close();
    auditRepository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid and duplicate create/update attempts enqueue minimized denied events', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer']);
  const access = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    undefined,
    () => 'q'.repeat(43),
    () => crypto.randomUUID(),
    new SecurityAuditService(auditRepository),
  );
  const invalidName = 'raw-invalid-name-should-not-appear';
  const invalidEmail = 'raw-invalid-email-should-not-appear';
  try {
    await assert.rejects(access.updateUser(
      'admin-1', 'user-1', { displayName: ` ${invalidName} `.repeat(20), roles: undefined },
      'invalid-update',
    ), InvalidAccessInputError);
    await assert.rejects(access.createInvitation('admin-1', {
      displayName: 'Invite', email: invalidEmail, roles: ['reviewer'],
    }, 'invalid-create'), InvalidAccessInputError);
    await access.createInvitation('admin-1', {
      displayName: 'Invite', email: 'active@example.test', roles: ['reviewer'],
    }, 'active-create');
    await assert.rejects(access.createInvitation('admin-1', {
      displayName: 'Retry', email: 'ACTIVE@example.test', roles: ['operator'],
    }, 'active-retry'), AccessConflictError);

    const events = await new SecurityAuditService(auditRepository).list({
      category: 'access', limit: 20, offset: 0,
    });
    for (const requestId of ['invalid-update', 'invalid-create', 'active-retry']) {
      const event = events.items.find((item) => item.requestId === requestId);
      assert.equal(event?.outcome, 'denied');
      assert.equal(event?.actorUserId, 'admin-1');
    }
    assert.deepEqual(
      events.items.find((item) => item.requestId === 'invalid-update')?.metadata,
      { reason: 'invalid_request' },
    );
    assert.deepEqual(
      events.items.find((item) => item.requestId === 'invalid-create')?.metadata,
      { reason: 'invalid_request' },
    );
    const retry = events.items.find((item) => item.requestId === 'active-retry');
    assert.equal(retry?.action, 'access.invitation_created');
    assert.deepEqual(retry?.metadata, { reason: 'conflict', roleCount: 1 });
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes(invalidName), false);
    assert.equal(serialized.includes(invalidEmail), false);
    assert.equal(serialized.includes('active@example.test'), false);
  } finally {
    auth.close();
    auditRepository.close();
  }
});

async function createUser(
  repository: SqliteAuthRepository,
  passwords: ScryptPasswordHasher,
  id: string,
  email: string,
  roles: Array<'admin' | 'operator' | 'reviewer'>,
  password = 'initial secure password',
): Promise<void> {
  await repository.createUser({
    displayName: id,
    email,
    id,
    passwordHash: await passwords.hash(password),
    roles,
    timestamp: '2026-08-10T00:00:00.000Z',
  });
}

function secret(link: string, parameter: string): string {
  return new URLSearchParams(new URL(link).hash.split('?', 2)[1]).get(parameter)!;
}
