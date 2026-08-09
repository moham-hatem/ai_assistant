import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, hashSessionToken } from './token.ts';

test('session tokens have at least 256 random bits and only their fixed hash is persisted', () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(first, second);
  assert.match(hashSessionToken(first), /^[0-9a-f]{64}$/u);
  assert.equal(hashSessionToken(first).includes(first), false);
  assert.throws(() => createSessionToken(31));
});
