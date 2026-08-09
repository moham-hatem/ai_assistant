import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';
import { UnavailableSecurityAuditRepository } from '../modules/security-audit/unavailable-repository.ts';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService, InvalidCredentialsError, TooManyLoginAttemptsError } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';
import { AppError } from '../errors.ts';

test('login failures, login success, and logout persist minimized audit events', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  const passwords = new ScryptPasswordHasher({ cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024 });
  const password = 'private test password';
  const tokens = ['x'.repeat(43), 'y'.repeat(43)];
  await auth.createUser({
    displayName: 'Audit User', email: 'audit@example.test', id: 'audit-user',
    passwordHash: await passwords.hash(password), roles: ['reviewer'],
    timestamp: '2026-08-10T00:00:00.000Z',
  });
  const service = await createAuthService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { absoluteTtlMs: 60_000, idleTtlMs: 10_000 },
    { audit, tokenFactory: () => tokens.shift()! },
  );
  try {
    await assert.rejects(service.login({
      email: 'audit@example.test', password: 'incorrect password', rateLimitKey: 'local',
      requestId: 'request-failure',
    }), InvalidCredentialsError);
    const login = await service.login({
      email: 'audit@example.test', password, rateLimitKey: 'local', requestId: 'request-success',
    });
    const rotated = await service.login({
      email: 'audit@example.test', password, previousSessionToken: login.sessionToken,
      rateLimitKey: 'local', requestId: 'request-rotation',
    });
    await service.logout(rotated.sessionToken, 'request-logout');
    await service.logout(rotated.sessionToken, 'request-repeated-logout');
    const events = await audit.list({ limit: 10, offset: 0 });
    assert.deepEqual(events.items.map((event) => [event.action, event.outcome]).sort(), [
      ['auth.login', 'failure'], ['auth.login', 'success'], ['auth.login', 'success'],
      ['auth.logout', 'success'], ['auth.session_revoked', 'success'],
    ]);
    const rotation = events.items.find((event) => event.action === 'auth.session_revoked');
    assert.equal(rotation?.actorUserId, 'audit-user');
    assert.deepEqual(rotation?.metadata, { reason: 'rotated' });
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes(password), false);
    assert.equal(serialized.includes(login.sessionToken), false);
    assert.equal(serialized.includes(rotated.sessionToken), false);
    assert.equal(serialized.includes('audit@example.test'), false);
  } finally {
    auth.close();
    auditRepository.close();
  }
});

test('failed and rate-limited logins remain in the auth outbox while the audit sink is down', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher({ cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024 });
  const unavailable = new SecurityAuditService(new UnavailableSecurityAuditRepository());
  const service = await createAuthService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(2, 60_000),
    { absoluteTtlMs: 60_000, idleTtlMs: 10_000 },
    { audit: unavailable },
  );
  try {
    await assert.rejects(service.login({
      email: 'missing@example.test', password: 'wrong password', rateLimitKey: 'local',
      requestId: 'request-failure',
    }), InvalidCredentialsError);
    await assert.rejects(service.login({
      email: 'missing@example.test', password: 'wrong password', rateLimitKey: 'local',
      requestId: 'request-limited',
    }), TooManyLoginAttemptsError);

    const target = new SqliteSecurityAuditRepository(
      ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
    );
    try {
      const recovered = new SecurityAuditService(target);
      assert.equal(await auth.flushSecurityAuditOutbox(recovered), 2);
      const events = await recovered.list({ action: 'auth.login', limit: 10, offset: 0 });
      assert.deepEqual(events.items.map((event) => event.outcome).sort(), ['denied', 'failure']);
      assert.equal(JSON.stringify(events).includes('missing@example.test'), false);
      assert.equal(JSON.stringify(events).includes('wrong password'), false);
    } finally {
      target.close();
    }
  } finally {
    auth.close();
  }
});

test('login success fails closed with 503 when its durable audit event cannot be delivered', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher({ cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024 });
  const password = 'valid local password';
  await auth.createUser({
    displayName: 'Unavailable Audit User', email: 'unavailable@example.test', id: 'user-down',
    passwordHash: await passwords.hash(password), roles: ['reviewer'],
    timestamp: '2026-08-10T00:00:00.000Z',
  });
  const service = await createAuthService(
    auth,
    passwords,
    new InMemoryLoginRateLimiter(),
    { absoluteTtlMs: 60_000, idleTtlMs: 10_000 },
    {
      audit: new SecurityAuditService(new UnavailableSecurityAuditRepository()),
      tokenFactory: () => 's'.repeat(43),
    },
  );
  try {
    await assert.rejects(service.login({
      email: 'unavailable@example.test', password, rateLimitKey: 'local',
      requestId: 'request-login-down',
    }), (error: unknown) => error instanceof AppError
      && error.code === 'SECURITY_AUDIT_UNAVAILABLE'
      && error.status === 503);
    const target = new SqliteSecurityAuditRepository(
      ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
    );
    try {
      assert.equal(await auth.flushSecurityAuditOutbox(new SecurityAuditService(target)), 1);
    } finally {
      target.close();
    }
  } finally {
    auth.close();
  }
});
