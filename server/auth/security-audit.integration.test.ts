import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService, InvalidCredentialsError } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';

test('login failures, login success, and logout persist minimized audit events', async () => {
  const auth = new SqliteAuthRepository(':memory:');
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  const passwords = new ScryptPasswordHasher({ cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024 });
  const password = 'private test password';
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
    { audit, tokenFactory: () => 'x'.repeat(43) },
  );
  try {
    await assert.rejects(service.login({
      email: 'audit@example.test', password: 'incorrect password', rateLimitKey: 'local',
      requestId: 'request-failure',
    }), InvalidCredentialsError);
    const login = await service.login({
      email: 'audit@example.test', password, rateLimitKey: 'local', requestId: 'request-success',
    });
    await service.logout(login.sessionToken, 'request-logout');
    const events = await audit.list({ limit: 10, offset: 0 });
    assert.deepEqual(events.items.map((event) => [event.action, event.outcome]).sort(), [
      ['auth.login', 'failure'], ['auth.login', 'success'], ['auth.logout', 'success'],
    ]);
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes(password), false);
    assert.equal(serialized.includes(login.sessionToken), false);
    assert.equal(serialized.includes('audit@example.test'), false);
  } finally {
    auth.close();
    auditRepository.close();
  }
});
