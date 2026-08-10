import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { AppError } from '../errors.ts';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';
import { UnavailableSecurityAuditRepository } from '../modules/security-audit/unavailable-repository.ts';
import {
  AccessConflictError,
  AccessLockoutError,
  AccessService,
  AccessTokenRejectedError,
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

test('a lost recovery link is safely superseded after audit delivery recovers without duplicates', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer']);
  const tokens = ['l'.repeat(43), 'w'.repeat(43)];
  const ids = ['lost-recovery', 'replacement-recovery'];
  const unavailable = new AccessService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    () => new Date('2026-08-10T00:00:00.000Z'),
    () => tokens.shift()!,
    () => ids.shift()!,
    new SecurityAuditService(new UnavailableSecurityAuditRepository()),
  );
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  try {
    await assert.rejects(
      unavailable.createRecovery('admin-1', 'user-1', 'issue-lost-recovery'),
      (error: unknown) => error instanceof AppError
        && error.code === 'SECURITY_AUDIT_UNAVAILABLE'
        && error.status === 503,
    );
    assert.equal(
      (await auth.findRecoveryByTokenHash(hashSessionToken('l'.repeat(43))))?.revokedAt,
      null,
    );

    const audit = new SecurityAuditService(auditRepository);
    const recovered = new AccessService(
      auth,
      passwords,
      new InMemoryLoginRateLimiter(),
      { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
      () => new Date('2026-08-10T00:00:30.000Z'),
      () => tokens.shift()!,
      () => ids.shift()!,
      audit,
    );
    const replacement = await recovered.createRecovery(
      'admin-1', 'user-1', 'issue-replacement-recovery',
    );
    assert.equal(replacement.id, 'replacement-recovery');
    assert.equal(
      (await auth.findRecoveryByTokenHash(hashSessionToken('l'.repeat(43))))?.revokedAt,
      '2026-08-10T00:00:30.000Z',
    );
    assert.equal(
      (await auth.findRecoveryByTokenHash(hashSessionToken('w'.repeat(43))))?.revokedAt,
      null,
    );
    await assert.rejects(
      recovered.redeemRecovery(
        'l'.repeat(43), 'replacement secure password', 'lost-client', 'redeem-lost-recovery',
      ),
      AccessTokenRejectedError,
    );

    const events = await audit.list({ category: 'access', limit: 20, offset: 0 });
    const successfulIssueEvents = events.items.filter((event) =>
      event.outcome === 'success'
      && ['issue-lost-recovery', 'issue-replacement-recovery'].includes(event.requestId));
    assert.equal(successfulIssueEvents.filter((event) =>
      event.action === 'access.recovery_created').length, 2);
    const superseded = successfulIssueEvents.filter((event) =>
      event.action === 'access.recovery_revoked');
    assert.equal(superseded.length, 1);
    assert.equal(superseded[0]?.subjectId, 'lost-recovery');
    assert.deepEqual(superseded[0]?.metadata, { reason: 'superseded' });
    assert.equal(new Set(events.items.map((event) => event.id)).size, events.items.length);
    assert.equal(await auth.flushSecurityAuditOutbox(audit), 0);
  } finally {
    auth.close();
    auditRepository.close();
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
  const retainedRecoveryToken = 'p'.repeat(43);
  await auth.createRecovery({
    createdAt: '2026-08-10T00:00:00.000Z',
    createdByUserId: 'admin-1',
    expiresAt: '2026-08-10T01:00:00.000Z',
    id: 'retained-recovery',
    tokenHash: hashSessionToken(retainedRecoveryToken),
    userId: 'user-1',
  });
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
    () => new Date('2026-08-10T00:00:00.000Z'),
    () => 'n'.repeat(43),
    () => 'rolled-back-recovery',
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
    await assert.rejects(
      access.createRecovery('admin-1', 'user-1', 'request-recovery-rollback'),
      (error: unknown) => error instanceof AppError
        && error.code === 'SECURITY_AUDIT_UNAVAILABLE'
        && error.status === 503,
    );
    assert.equal(
      (await auth.findRecoveryByTokenHash(hashSessionToken(retainedRecoveryToken)))?.revokedAt,
      null,
    );
    assert.equal(
      await auth.findRecoveryByTokenHash(hashSessionToken('n'.repeat(43))),
      undefined,
    );
    const fallback = await new SecurityAuditService(auditRepository).list({
      category: 'access', limit: 10, offset: 0,
    });
    const rollbackFailure = fallback.items.find((event) => event.requestId === 'request-rollback');
    assert.equal(rollbackFailure?.outcome, 'failure');
    assert.deepEqual(rollbackFailure?.metadata, { reason: 'storage_failure' });
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
      event.requestId === 'create-recovery-2'
      && event.action === 'access.recovery_revoked');
    assert.equal(recoverySibling?.subjectId, firstRecovery.id);
    assert.equal(recoverySibling?.actorUserId, 'admin-1');
    assert.deepEqual(recoverySibling?.metadata, { reason: 'superseded' });
    const secondIssueEvents = events.items.filter((event) =>
      event.requestId === 'create-recovery-2' && event.outcome === 'success');
    assert.deepEqual(
      secondIssueEvents.map((event) => [event.action, event.subjectId]).sort(),
      [
        ['access.recovery_created', secondRecovery.id],
        ['access.recovery_revoked', firstRecovery.id],
      ].sort(),
    );
    const serializedIssueEvents = JSON.stringify(secondIssueEvents);
    for (const forbidden of [
      'user@example.test',
      secret(firstRecovery.link, 'recovery'),
      secret(secondRecovery.link, 'recovery'),
    ]) assert.equal(serializedIssueEvents.includes(forbidden), false);
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

test('competing recovery issues leave one active token and audit the actual supersession', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'access-audit-recovery-race-'));
  const authPath = join(directory, 'auth.sqlite');
  const auditPath = join(directory, 'audit.sqlite');
  const auditKey = randomBytes(32);
  const passwords = new ScryptPasswordHasher(fastScrypt);
  const auth = new SqliteAuthRepository(authPath);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer']);
  auth.close();
  new SqliteSecurityAuditRepository(
    auditPath, new Map([['v1', auditKey]]), 'v1',
  ).close();
  const operations = [
    {
      id: 'raced-recovery-a', kind: 'recovery', requestId: 'issue-race-a',
      token: 'a'.repeat(43), userId: 'user-1',
    },
    {
      id: 'raced-recovery-b', kind: 'recovery', requestId: 'issue-race-b',
      token: 'b'.repeat(43), userId: 'user-1',
    },
  ] as const;
  try {
    await runConcurrentAccessOperations(authPath, auditPath, auditKey, operations);
    const reopenedAuth = new SqliteAuthRepository(authPath);
    const auditRepository = new SqliteSecurityAuditRepository(
      auditPath, new Map([['v1', auditKey]]), 'v1',
    );
    try {
      const recoveries = await Promise.all(operations.map((operation) =>
        reopenedAuth.findRecoveryByTokenHash(hashSessionToken(operation.token)),
      ));
      const activeIndex = recoveries.findIndex((recovery) => recovery?.revokedAt === null);
      const revokedIndex = recoveries.findIndex((recovery) => recovery?.revokedAt !== null);
      assert.notEqual(activeIndex, -1);
      assert.notEqual(revokedIndex, -1);
      assert.notEqual(activeIndex, revokedIndex);

      const audit = new SecurityAuditService(auditRepository);
      const events = (await audit.list({ category: 'access', limit: 20, offset: 0 })).items;
      const issueEvents = events.filter((event) => event.requestId.startsWith('issue-race-'));
      assert.equal(issueEvents.filter((event) =>
        event.action === 'access.recovery_created').length, 2);
      const revokedEvents = issueEvents.filter((event) =>
        event.action === 'access.recovery_revoked');
      assert.equal(revokedEvents.length, 1);
      assert.equal(revokedEvents[0]?.subjectId, operations[revokedIndex]!.id);
      assert.equal(revokedEvents[0]?.requestId, operations[activeIndex]!.requestId);
      assert.equal(revokedEvents[0]?.actorUserId, 'admin-1');
      assert.deepEqual(revokedEvents[0]?.metadata, { reason: 'superseded' });
      const serialized = JSON.stringify(issueEvents);
      for (const forbidden of [
        'user@example.test', operations[0].token, operations[1].token,
      ]) assert.equal(serialized.includes(forbidden), false);
      assert.equal(new Set(issueEvents.map((event) => event.id)).size, issueEvents.length);
      assert.equal(await reopenedAuth.flushSecurityAuditOutbox(audit), 0);
    } finally {
      reopenedAuth.close();
      auditRepository.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('independent concurrent updates audit the locked display-name, roles, enablement, and session results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'access-audit-authoritative-'));
  const authPath = join(directory, 'auth.sqlite');
  const auditPath = join(directory, 'audit.sqlite');
  const auditKey = randomBytes(32);
  const passwords = new ScryptPasswordHasher(fastScrypt);
  const auth = new SqliteAuthRepository(authPath);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'update-user', 'update@example.test', ['reviewer']);
  await createUser(auth, passwords, 'enabled-user', 'enabled@example.test', ['reviewer']);
  await saveActiveSession(auth, 'update-user', 'update-session');
  await saveActiveSession(auth, 'enabled-user', 'enabled-session');
  auth.close();
  new SqliteSecurityAuditRepository(
    auditPath, new Map([['v1', auditKey]]), 'v1',
  ).close();

  try {
    await runConcurrentAccessOperations(authPath, auditPath, auditKey, [
      {
        input: { displayName: 'Changed Name', roles: ['operator', 'reviewer'] },
        kind: 'update',
        requestId: 'concurrent-change',
        userId: 'update-user',
      },
      {
        input: { displayName: 'update-user', roles: ['reviewer'] },
        kind: 'update',
        requestId: 'concurrent-reset',
        userId: 'update-user',
      },
    ]);
    await runConcurrentAccessOperations(authPath, auditPath, auditKey, [
      {
        enabled: false,
        kind: 'enabled',
        requestId: 'concurrent-disable',
        userId: 'enabled-user',
      },
      {
        enabled: true,
        kind: 'enabled',
        requestId: 'concurrent-enable',
        userId: 'enabled-user',
      },
    ]);

    const reopenedAuth = new SqliteAuthRepository(authPath);
    const auditRepository = new SqliteSecurityAuditRepository(
      auditPath, new Map([['v1', auditKey]]), 'v1',
    );
    try {
      const updateUser = await reopenedAuth.findUserById('update-user');
      const enabledUser = await reopenedAuth.findUserById('enabled-user');
      const events = (await new SecurityAuditService(auditRepository).list({
        category: 'access', limit: 100, offset: 0,
      })).items;
      const profile = (requestId: string) => events.find((event) =>
        event.requestId === requestId && event.action === 'access.user_profile_changed');
      const roles = (requestId: string) => events.find((event) =>
        event.requestId === requestId && event.action === 'access.user_roles_changed');
      const sessions = (requestId: string) => events.find((event) =>
        event.requestId === requestId && event.action === 'access.user_sessions_revoked');

      assert.deepEqual(profile('concurrent-change')?.metadata, { changed: true });
      assert.equal(roles('concurrent-change')?.metadata.nextRoleCount, 2);
      assert.equal(roles('concurrent-change')?.metadata.changed, true);
      if (updateUser?.displayName === 'Changed Name') {
        assert.deepEqual(updateUser.roles, ['operator', 'reviewer']);
        assert.deepEqual(profile('concurrent-reset')?.metadata, { changed: false });
        assert.deepEqual(roles('concurrent-reset')?.metadata, {
          changed: false, nextRoleCount: 1, previousRoleCount: 1,
        });
        assert.equal(sessions('concurrent-reset'), undefined);
        assert.equal(sessions('concurrent-change')?.metadata.sessionCount, 1);
      } else {
        assert.equal(updateUser?.displayName, 'update-user');
        assert.deepEqual(updateUser?.roles, ['reviewer']);
        assert.deepEqual(profile('concurrent-reset')?.metadata, { changed: true });
        assert.deepEqual(roles('concurrent-reset')?.metadata, {
          changed: true, nextRoleCount: 1, previousRoleCount: 2,
        });
        assert.deepEqual([
          sessions('concurrent-change')?.metadata.sessionCount,
          sessions('concurrent-reset')?.metadata.sessionCount,
        ].sort(), [0, 1]);
      }

      const disabled = events.find((event) => event.requestId === 'concurrent-disable'
        && event.action === 'access.user_disabled');
      const enabled = events.find((event) => event.requestId === 'concurrent-enable'
        && event.action === 'access.user_enabled');
      assert.deepEqual(disabled?.metadata, { changed: true });
      assert.equal(sessions('concurrent-disable')?.metadata.sessionCount, 1);
      if (enabledUser?.enabled) {
        assert.deepEqual(enabled?.metadata, { changed: true });
      } else {
        assert.deepEqual(enabled?.metadata, { changed: false });
      }
      assert.equal(JSON.stringify(events).includes('Changed Name'), false);
      assert.equal(JSON.stringify(events).includes('update@example.test'), false);
    } finally {
      reopenedAuth.close();
      auditRepository.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('authoritative update survives sink outage with exact retryable events and no duplicates', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(auth, passwords, 'admin-1', 'admin@example.test', ['admin']);
  await createUser(auth, passwords, 'user-1', 'user@example.test', ['reviewer']);
  await saveActiveSession(auth, 'user-1', 'outage-session');
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
    await assert.rejects(access.updateUser(
      'admin-1', 'user-1', { displayName: 'Authoritative Name', roles: ['operator'] },
      'authoritative-outage',
    ), (error: unknown) => error instanceof AppError
      && error.code === 'SECURITY_AUDIT_UNAVAILABLE' && error.status === 503);
    const user = await auth.findUserById('user-1');
    assert.equal(user?.displayName, 'Authoritative Name');
    assert.deepEqual(user?.roles, ['operator']);
    assert.equal((await auth.findSession(hashSessionToken('outage-session'.padEnd(43, 'x'))))?.revokedAt !== null, true);

    const recoveredRepository = new SqliteSecurityAuditRepository(
      ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
    );
    try {
      const recovered = new SecurityAuditService(recoveredRepository);
      assert.equal(await auth.flushSecurityAuditOutbox(recovered), 3);
      assert.equal(await auth.flushSecurityAuditOutbox(recovered), 0);
      const events = (await recovered.list({ category: 'access', limit: 10, offset: 0 })).items;
      assert.equal(events.length, 3);
      assert.deepEqual(events.find((event) =>
        event.action === 'access.user_profile_changed')?.metadata, { changed: true });
      assert.deepEqual(events.find((event) =>
        event.action === 'access.user_roles_changed')?.metadata, {
        changed: true, nextRoleCount: 1, previousRoleCount: 1,
      });
      assert.deepEqual(events.find((event) =>
        event.action === 'access.user_sessions_revoked')?.metadata, {
        reason: 'user_access_changed', sessionCount: 1,
      });
    } finally {
      recoveredRepository.close();
    }
  } finally {
    auth.close();
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

async function saveActiveSession(
  repository: SqliteAuthRepository,
  userId: string,
  label: string,
): Promise<void> {
  const timestamp = '2026-08-10T00:00:00.000Z';
  await repository.saveSession({
    absoluteExpiresAt: '2026-08-11T00:00:00.000Z',
    createdAt: timestamp,
    idleExpiresAt: '2026-08-10T01:00:00.000Z',
    lastSeenAt: timestamp,
    revokedAt: null,
    tokenHash: hashSessionToken(label.padEnd(43, 'x')),
    userId,
  });
}

type ConcurrentAccessOperation = {
  input: { displayName: string; roles: string[] };
  kind: 'update';
  requestId: string;
  userId: string;
} | {
  enabled: boolean;
  kind: 'enabled';
  requestId: string;
  userId: string;
} | {
  id: string;
  kind: 'recovery';
  requestId: string;
  token: string;
  userId: string;
};

async function runConcurrentAccessOperations(
  authPath: string,
  auditPath: string,
  auditKey: Buffer,
  operations: readonly [ConcurrentAccessOperation, ConcurrentAccessOperation],
): Promise<void> {
  const state = new Int32Array(new SharedArrayBuffer(8));
  const workers = operations.map((operation) => accessOperationWorker(
    authPath, auditPath, auditKey, operation, state.buffer,
  ));
  while (Atomics.load(state, 0) < workers.length) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  Atomics.store(state, 1, 1);
  Atomics.notify(state, 1, workers.length);
  await Promise.all(workers);
}

function accessOperationWorker(
  authPath: string,
  auditPath: string,
  auditKey: Buffer,
  operation: ConcurrentAccessOperation,
  barrier: SharedArrayBuffer,
): Promise<void> {
  const modules = {
    access: new URL('./access-service.ts', import.meta.url).href,
    auditRepository: new URL('../modules/security-audit/sqlite-repository.ts', import.meta.url).href,
    auditService: new URL('../modules/security-audit/service.ts', import.meta.url).href,
    authRepository: new URL('./sqlite-repository.ts', import.meta.url).href,
  };
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const [{ AccessService }, { SqliteSecurityAuditRepository }, { SecurityAuditService }, { SqliteAuthRepository }] = await Promise.all([
        import(workerData.modules.access),
        import(workerData.modules.auditRepository),
        import(workerData.modules.auditService),
        import(workerData.modules.authRepository),
      ]);
      const auth = new SqliteAuthRepository(workerData.authPath);
      const auditRepository = new SqliteSecurityAuditRepository(
        workerData.auditPath,
        new Map([['v1', Buffer.from(workerData.auditKey, 'base64')]]),
        'v1',
      );
      const passwords = { hash: async () => '', verify: async () => false };
      const limiter = {
        check: async () => ({ allowed: true }),
        recordFailure: async () => ({ allowed: true }),
        reset: async () => undefined,
      };
      const access = new AccessService(
        auth,
        passwords,
        limiter,
        { invitationTtlMs: 60_000, publicOrigin: 'http://app.local.test', recoveryTtlMs: 60_000 },
        () => new Date('2026-08-10T00:00:00.000Z'),
        () => workerData.operation.token ?? 'unused-access-token'.padEnd(43, 'x'),
        () => workerData.operation.id ?? 'unused-access-id',
        new SecurityAuditService(auditRepository),
      );
      const state = new Int32Array(workerData.barrier);
      Atomics.add(state, 0, 1);
      Atomics.wait(state, 1, 0);
      try {
        if (workerData.operation.kind === 'update') {
          await access.updateUser(
            'admin-1', workerData.operation.userId, workerData.operation.input,
            workerData.operation.requestId,
          );
        } else if (workerData.operation.kind === 'enabled') {
          await access.setEnabled(
            'admin-1', workerData.operation.userId, workerData.operation.enabled,
            workerData.operation.requestId,
          );
        } else {
          await access.createRecovery(
            'admin-1', workerData.operation.userId, workerData.operation.requestId,
          );
        }
      } finally {
        auth.close();
        auditRepository.close();
      }
      parentPort.postMessage({ ok: true });
    })().catch((error) => parentPort.postMessage({ error: error.stack ?? error.message }));
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: {
        auditKey: auditKey.toString('base64'),
        auditPath,
        authPath,
        barrier,
        modules,
        operation,
      },
    });
    worker.once('message', (message: { error?: string; ok?: boolean }) => {
      if (message.ok) resolve();
      else reject(new Error(message.error ?? 'Access operation worker failed.'));
    });
    worker.once('error', reject);
  });
}

function secret(link: string, parameter: string): string {
  return new URLSearchParams(new URL(link).hash.split('?', 2)[1]).get(parameter)!;
}
