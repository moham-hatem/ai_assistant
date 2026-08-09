import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAuthUserCliOptions, upsertLocalAuthUser } from './cli.ts';
import { ScryptPasswordHasher } from './password.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';

test('CLI accepts only non-secret arguments and normalizes roles', () => {
  assert.deepEqual(parseAuthUserCliOptions([
    '--email', 'person@example.org', '--roles', 'admin,reviewer,admin',
  ], { AUTH_DATABASE_PATH: ':memory:' }), {
    databasePath: ':memory:',
    email: 'person@example.org',
    roles: ['reviewer', 'admin'],
  });
  assert.throws(() => parseAuthUserCliOptions([
    '--email', 'person@example.org', '--roles', 'admin', '--password', 'secret',
  ]), /intentionally unsupported/u);
});

test('CLI upsert hashes passwords and revokes sessions on updates', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher({
    cost: 1_024,
    keyLength: 32,
    maxMemory: 4 * 1024 * 1024,
  });
  const created = await upsertLocalAuthUser(repository, passwords, {
    email: 'person@example.org', roles: ['operator'],
  }, 'first strong password', new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(created.action, 'created');
  const user = await repository.findUserByEmail('person@example.org');
  assert.equal(user?.passwordHash.includes('first strong password'), false);
  const updated = await upsertLocalAuthUser(repository, passwords, {
    email: 'person@example.org', roles: ['reviewer'],
  }, 'second strong password', new Date('2026-01-02T00:00:00.000Z'));
  assert.equal(updated.action, 'updated');
  assert.deepEqual(updated.principal.roles, ['reviewer']);
  repository.close();
});
