import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AccessLockoutError,
  AccessService,
  AccessTokenRejectedError,
} from './access-service.ts';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService, InvalidCredentialsError } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';

const fastScrypt = { cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024 };
const publicOrigin = 'http://app.local.test';

test('invitation links keep hashed, expiring, revocable, single-use tokens in fragments', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-access-token-'));
  const databasePath = join(directory, 'auth.sqlite');
  const repository = new SqliteAuthRepository(databasePath);
  const passwords = new ScryptPasswordHasher(fastScrypt);
  let time = Date.parse('2026-01-01T00:00:00.000Z');
  const tokens = ['a'.repeat(43), 'b'.repeat(43), 'c'.repeat(43)];
  let id = 0;
  await createUser(repository, passwords, 'admin-1', 'admin@example.org', ['admin']);
  const service = new AccessService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { invitationTtlMs: 1_000, publicOrigin, recoveryTtlMs: 1_000 },
    () => new Date(time),
    () => tokens.shift()!,
    () => `token-id-${++id}`,
  );

  try {
    const invitation = await service.createInvitation('admin-1', {
      displayName: 'Invited Reviewer',
      email: 'invited@example.org',
      roles: ['reviewer'],
    });
    assert.equal(invitation.warning, 'This link is a secret and will not be shown again.');
    assertSecretFragment(invitation.link, 'password-setup', 'invitation', 'a'.repeat(43));
    assert.equal(await repository.findUserByEmail('invited@example.org'), undefined);
    await service.redeemInvitation(
      'a'.repeat(43), 'invited secure password', 'client-1',
    );
    const invited = await repository.findUserByEmail('invited@example.org');
    assert.equal(invited?.enabled, true);
    await assert.rejects(
      () => service.redeemInvitation('a'.repeat(43), 'another secure password', 'client-1'),
      AccessTokenRejectedError,
    );

    const expiring = await service.createInvitation('admin-1', {
      displayName: 'Expired Invite', email: 'expired@example.org', roles: ['operator'],
    });
    time += 1_001;
    await assert.rejects(
      () => service.redeemInvitation(
        secretFromFragment(expiring.link, 'invitation'), 'expired secure password', 'client-2',
      ),
      AccessTokenRejectedError,
    );

    const revoked = await service.createInvitation('admin-1', {
      displayName: 'Revoked Invite', email: 'revoked@example.org', roles: ['reviewer'],
    });
    await service.revokeInvitation(revoked.id);
    await assert.rejects(
      () => service.redeemInvitation(
        secretFromFragment(revoked.link, 'invitation'), 'revoked secure password', 'client-3',
      ),
      AccessTokenRejectedError,
    );
    repository.close();

    const bytes = readdirSync(directory)
      .map((file) => readFileSync(join(directory, file)))
      .reduce((combined, item) => Buffer.concat([combined, item]), Buffer.alloc(0));
    for (const rawToken of ['a'.repeat(43), 'b'.repeat(43), 'c'.repeat(43)]) {
      assert.equal(bytes.includes(Buffer.from(rawToken)), false);
    }
  } finally {
    try { repository.close(); } catch {}
    await rm(directory, { force: true, recursive: true });
  }
});

test('disabled users cannot login or refresh sessions and recovery is single-use', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  let time = Date.parse('2026-01-01T00:00:00.000Z');
  let sessionNumber = 0;
  const recoveryTokens = [
    'r'.repeat(43), 's'.repeat(43), 'e'.repeat(43), 'v'.repeat(43),
  ];
  let recoveryId = 0;
  await createUser(repository, passwords, 'admin-1', 'admin@example.org', ['admin']);
  await createUser(repository, passwords, 'user-1', 'user@example.org', ['reviewer']);
  const auth = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { absoluteTtlMs: 60_000, idleTtlMs: 30_000 },
    { now: () => new Date(time), tokenFactory: () => String(++sessionNumber).padStart(43, 's') },
  );
  const access = new AccessService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    () => new Date(time),
    () => recoveryTokens.shift()!,
    () => `recovery-${++recoveryId}`,
  );
  const login = await auth.login({
    email: 'user@example.org', password: 'initial secure password', rateLimitKey: 'client',
  });
  await access.setEnabled('admin-1', 'user-1', false);
  assert.equal(await auth.getPrincipal(login.sessionToken), null);
  await assert.rejects(() => auth.login({
    email: 'user@example.org', password: 'initial secure password', rateLimitKey: 'disabled',
  }), InvalidCredentialsError);

  await access.setEnabled('admin-1', 'user-1', true);
  const recovery = await access.createRecovery('admin-1', 'user-1');
  const siblingRecovery = await access.createRecovery('admin-1', 'user-1');
  assertSecretFragment(recovery.link, 'password-recovery', 'recovery', 'r'.repeat(43));
  const rawToken = secretFromFragment(recovery.link, 'recovery');
  await access.redeemRecovery(rawToken, 'replacement secure password', 'recovery-client');
  await assert.rejects(
    () => access.redeemRecovery(rawToken, 'second replacement password', 'recovery-client'),
    AccessTokenRejectedError,
  );
  await assert.rejects(
    () => access.redeemRecovery(
      secretFromFragment(siblingRecovery.link, 'recovery'),
      'sibling replacement password',
      'sibling-recovery-client',
    ),
    AccessTokenRejectedError,
  );
  await assert.rejects(() => auth.login({
    email: 'user@example.org', password: 'initial secure password', rateLimitKey: 'old-password',
  }), InvalidCredentialsError);
  const recovered = await auth.login({
    email: 'user@example.org', password: 'replacement secure password', rateLimitKey: 'new-password',
  });
  assert.equal(recovered.principal.id, 'user-1');

  const expiring = await access.createRecovery('admin-1', 'user-1');
  time += 60_001;
  await assert.rejects(() => access.redeemRecovery(
    secretFromFragment(expiring.link, 'recovery'),
    'expired recovery password',
    'expired-recovery-client',
  ), AccessTokenRejectedError);
  const revoked = await access.createRecovery('admin-1', 'user-1');
  await access.revokeRecovery(revoked.id);
  await assert.rejects(() => access.redeemRecovery(
    secretFromFragment(revoked.link, 'recovery'),
    'revoked recovery password',
    'revoked-recovery-client',
  ), AccessTokenRejectedError);
  repository.close();
});

test('concurrent recovery redemptions for one user allow exactly one token', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(repository, passwords, 'admin-1', 'admin@example.org', ['admin']);
  await createUser(repository, passwords, 'user-1', 'user@example.org', ['reviewer']);
  const rawTokens = ['c'.repeat(43), 'd'.repeat(43)];
  let recoveryId = 0;
  const access = new AccessService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    undefined,
    () => rawTokens.shift()!,
    () => `concurrent-recovery-${++recoveryId}`,
  );
  const first = await access.createRecovery('admin-1', 'user-1');
  const second = await access.createRecovery('admin-1', 'user-1');

  const results = await Promise.allSettled([
    access.redeemRecovery(
      secretFromFragment(first.link, 'recovery'), 'first concurrent password', 'client-a',
    ),
    access.redeemRecovery(
      secretFromFragment(second.link, 'recovery'), 'second concurrent password', 'client-b',
    ),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected?.status, 'rejected');
  if (rejected?.status === 'rejected') {
    assert.equal(rejected.reason instanceof AccessTokenRejectedError, true);
  }
  repository.close();
});

test('access updates prevent last-admin and self lockout and return bounded safe pages', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher(fastScrypt);
  await createUser(repository, passwords, 'admin-1', 'admin1@example.org', ['admin']);
  await createUser(repository, passwords, 'reviewer-1', 'reviewer@example.org', ['reviewer']);
  const access = new AccessService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
  );

  await assert.rejects(() => access.setEnabled('admin-1', 'admin-1', false), AccessLockoutError);
  await assert.rejects(() => access.updateUser('admin-1', 'admin-1', {
    displayName: 'Former Admin', roles: ['reviewer'],
  }), AccessLockoutError);
  await assert.rejects(() => access.updateUser('reviewer-1', 'admin-1', {
    displayName: 'Former Admin', roles: ['reviewer'],
  }), AccessLockoutError);

  await createUser(repository, passwords, 'admin-2', 'admin2@example.org', ['admin']);
  const updated = await access.updateUser('admin-2', 'admin-1', {
    displayName: 'Retired Administrator', roles: ['reviewer'],
  });
  assert.deepEqual(updated.roles, ['reviewer']);
  const page = await access.listUsers(undefined, '2');
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
  assert.equal('passwordHash' in page.items[0], false);
  assert.equal('tokenHash' in page.items[0], false);
  const secondPage = await access.listUsers(page.nextCursor, '2');
  assert.equal(secondPage.items.length, 1);
  const renamed = await access.updateUser('admin-2', 'reviewer-1', {
    displayName: 'Renamed Reviewer', roles: undefined,
  });
  assert.equal(renamed.displayName, 'Renamed Reviewer');
  assert.deepEqual(renamed.roles, ['reviewer']);
  repository.close();
});

async function createUser(
  repository: SqliteAuthRepository,
  passwords: ScryptPasswordHasher,
  id: string,
  email: string,
  roles: Array<'admin' | 'reviewer'>,
): Promise<void> {
  await repository.createUser({
    displayName: id,
    email,
    id,
    passwordHash: await passwords.hash('initial secure password'),
    roles,
    timestamp: '2026-01-01T00:00:00.000Z',
  });
}

function assertSecretFragment(
  link: string,
  route: string,
  parameter: string,
  expectedToken: string,
): void {
  const url = new URL(link);
  assert.equal(url.origin, publicOrigin);
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '');
  assert.equal(url.hash.startsWith(`#/${route}?`), true);
  assert.equal(secretFromFragment(link, parameter), expectedToken);
  const requestUrl = new URL(url);
  requestUrl.hash = '';
  assert.equal(requestUrl.href, `${publicOrigin}/`);
  assert.equal(requestUrl.href.includes(expectedToken), false);
}

function secretFromFragment(link: string, parameter: string): string | null {
  const query = new URL(link).hash.split('?', 2)[1] ?? '';
  return new URLSearchParams(query).get(parameter);
}
