import assert from 'node:assert/strict';
import test from 'node:test';
import { PasswordPolicyError, ScryptPasswordHasher } from './password.ts';

const parameters = {
  cost: 1_024,
  keyLength: 32,
  maxMemory: 4 * 1024 * 1024,
};

test('scrypt hashes are salted, versioned, and verify without storing plaintext', async () => {
  const hasher = new ScryptPasswordHasher(parameters);
  const password = 'correct horse battery staple';
  const first = await hasher.hash(password);
  const second = await hasher.hash(password);

  assert.match(first, /^scrypt\$v=1\$ln=10,r=8,p=1\$/u);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await hasher.verify(password, first), true);
  assert.equal(await hasher.verify('incorrect password', first), false);
});

test('password policy uses UTF-8 byte limits and rejects unsafe parameters', async () => {
  const hasher = new ScryptPasswordHasher(parameters);
  await assert.rejects(() => hasher.hash('too-short'), PasswordPolicyError);
  await assert.rejects(() => hasher.hash('ع'.repeat(600)), PasswordPolicyError);
  assert.throws(() => new ScryptPasswordHasher({ ...parameters, saltBytes: 15 }));
  assert.throws(() => new ScryptPasswordHasher({ ...parameters, cost: 1_000 }));
});

test('verification rejects malformed and resource-amplifying encoded hashes safely', async () => {
  const hasher = new ScryptPasswordHasher(parameters);
  assert.equal(await hasher.verify('any password here', 'plaintext'), false);
  const salt = Buffer.alloc(16).toString('base64url');
  const key = Buffer.alloc(64).toString('base64url');
  assert.equal(
    await hasher.verify('any password here', `scrypt$v=1$ln=20,r=8,p=1$${salt}$${key}`),
    false,
  );
  assert.equal(await hasher.verify('x'.repeat(1_025), 'anything'), false);
});
