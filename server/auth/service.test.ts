import assert from 'node:assert/strict';
import test from 'node:test';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService, InvalidCredentialsError, TooManyLoginAttemptsError } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';
import { hashSessionToken } from './token.ts';

const fastScrypt = { cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024 };

test('login is enumeration-resistant, stores only a token hash, and rotates an old session', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  const at = new Date('2026-01-01T00:00:00.000Z');
  const passwordHash = await passwords.hash('a sufficiently long secret');
  await repository.createUser({
    displayName: 'Local Reviewer',
    email: 'reviewer@example.org',
    id: 'user-1',
    passwordHash,
    roles: ['reviewer'],
    timestamp: at.toISOString(),
  });
  const tokens = ['a'.repeat(43), 'b'.repeat(43)];
  const service = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { absoluteTtlMs: 60_000, idleTtlMs: 10_000 },
    { now: () => at, tokenFactory: () => tokens.shift()! },
  );

  await assert.rejects(() => service.login({
    email: 'missing@example.org',
    password: 'a sufficiently long secret',
    rateLimitKey: 'client',
  }), InvalidCredentialsError);
  await assert.rejects(() => service.login({
    email: 'reviewer@example.org',
    password: 'wrong but sufficiently long',
    rateLimitKey: 'client',
  }), InvalidCredentialsError);

  const first = await service.login({
    email: ' REVIEWER@example.org ',
    password: 'a sufficiently long secret',
    rateLimitKey: 'client',
  });
  assert.equal(first.sessionToken, 'a'.repeat(43));
  assert.equal(await repository.findSession(first.sessionToken), undefined);
  assert.ok(await repository.findSession(hashSessionToken(first.sessionToken)));

  const second = await service.login({
    email: 'reviewer@example.org',
    password: 'a sufficiently long secret',
    previousSessionToken: first.sessionToken,
    rateLimitKey: 'client',
  });
  assert.notEqual(second.sessionToken, first.sessionToken);
  assert.ok((await repository.findSession(hashSessionToken(first.sessionToken)))?.revokedAt);
  repository.close();
});

test('sessions enforce idle and absolute expiry and security changes revoke all sessions', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  let time = Date.parse('2026-01-01T00:00:00.000Z');
  await repository.createUser({
    displayName: 'Local Admin',
    email: 'admin@example.org',
    id: 'user-1',
    passwordHash: await passwords.hash('initial secure password'),
    roles: ['admin'],
    timestamp: new Date(time).toISOString(),
  });
  const service = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(50, 60_000),
    { absoluteTtlMs: 30_000, idleTtlMs: 10_000 },
    { now: () => new Date(time), tokenFactory: () => 'c'.repeat(43) },
  );
  const login = await service.login({
    email: 'admin@example.org',
    password: 'initial secure password',
    rateLimitKey: 'client',
  });
  time += 9_000;
  assert.equal((await service.getPrincipal(login.sessionToken))?.id, 'user-1');
  time += 11_000;
  assert.equal(await service.getPrincipal(login.sessionToken), null);

  time += 1_000;
  const nextService = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(50, 60_000),
    { absoluteTtlMs: 30_000, idleTtlMs: 10_000 },
    { now: () => new Date(time), tokenFactory: () => 'd'.repeat(43) },
  );
  const next = await nextService.login({
    email: 'admin@example.org',
    password: 'initial secure password',
    rateLimitKey: 'client',
  });
  const principal = await nextService.updateUserSecurity({
    displayName: 'Content Admin',
    email: 'admin@example.org',
    password: 'replacement secure password',
    roles: ['admin', 'content_manager'],
    userId: 'user-1',
  });
  assert.equal(principal.permissions.includes('content:review'), true);
  assert.equal(principal.permissions.includes('settings:manage'), true);
  assert.equal(principal.displayName, 'Content Admin');
  assert.equal(await nextService.getPrincipal(next.sessionToken), null);
  await assert.rejects(() => nextService.login({
    email: 'admin@example.org',
    password: 'initial secure password',
    rateLimitKey: 'client',
  }), InvalidCredentialsError);
  repository.close();
});

test('local rate limiter is replaceable and returns a retry duration', async () => {
  const limiter = new InMemoryLoginRateLimiter(1, 5_000);
  assert.equal((await limiter.check('same-key', 1_000)).allowed, true);
  const blocked = await limiter.check('same-key', 2_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 4);
});
