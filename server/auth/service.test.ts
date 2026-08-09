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

test('local rate limiter records only failures and reset clears their window', async () => {
  const limiter = new InMemoryLoginRateLimiter(2, 5_000);
  assert.equal((await limiter.check('same-key', 1_000)).allowed, true);
  assert.equal((await limiter.check('same-key', 1_500)).allowed, true);
  assert.equal((await limiter.recordFailure('same-key', 2_000)).allowed, true);
  assert.equal((await limiter.check('same-key', 2_500)).allowed, true);
  const blocked = await limiter.recordFailure('same-key', 3_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 4);
  assert.equal((await limiter.check('same-key', 3_500)).allowed, false);
  await limiter.reset('same-key');
  assert.equal((await limiter.check('same-key', 3_500)).allowed, true);
});

test('repeated successful logins never consume failure capacity', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await repository.createUser({
    displayName: 'Local Operator',
    email: 'operator@example.org',
    id: 'operator-1',
    passwordHash: await passwords.hash('operator secure password'),
    roles: ['operator'],
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  let token = 0;
  const service = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(2, 60_000),
    { absoluteTtlMs: 60_000, idleTtlMs: 10_000 },
    { tokenFactory: () => String(++token).padStart(43, 't') },
  );
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const login = await service.login({
      email: 'operator@example.org',
      password: 'operator secure password',
      rateLimitKey: 'client',
    });
    assert.equal(login.principal.id, 'operator-1');
  }
  repository.close();
});

test('a success clears prior failures while subsequent failures remain limited', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await repository.createUser({
    displayName: 'Local Reviewer',
    email: 'limited@example.org',
    id: 'limited-1',
    passwordHash: await passwords.hash('correct limited password'),
    roles: ['reviewer'],
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  const service = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(2, 60_000),
    { absoluteTtlMs: 60_000, idleTtlMs: 10_000 },
    { tokenFactory: () => 'z'.repeat(43) },
  );
  const command = { email: 'limited@example.org', rateLimitKey: 'client' };
  await assert.rejects(() => service.login({
    ...command, password: 'first incorrect password',
  }), InvalidCredentialsError);
  await service.login({ ...command, password: 'correct limited password' });
  await assert.rejects(() => service.login({
    ...command, password: 'second incorrect password',
  }), InvalidCredentialsError);
  await assert.rejects(() => service.login({
    ...command, password: 'third incorrect password',
  }), TooManyLoginAttemptsError);
  repository.close();
});
