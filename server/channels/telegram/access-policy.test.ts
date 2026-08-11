import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPairingCode,
  createPairingLink,
  SingleLearnerAccessPolicy,
} from './access-policy.ts';
import { TelegramStore } from './store.ts';

const secret = 'telegram-session-secret-with-at-least-32-characters';

test('a one-time deep link pairs only the first private session', () => {
  const store = new TelegramStore(':memory:', secret);
  try {
    const code = createPairingCode();
    const policy = new SingleLearnerAccessPolicy(store, code);
    const owner = store.sessionKey(100);
    const stranger = store.sessionKey(200);
    store.ensureSession(owner);
    store.ensureSession(stranger);
    assert.equal(policy.authorize(owner, 'wrong-code'), 'denied');
    assert.equal(policy.authorize(owner, code), 'paired');
    assert.equal(policy.isAuthorized(owner), true);
    assert.equal(policy.authorize(owner), 'authorized');
    assert.equal(policy.authorize(stranger, code), 'denied');
    assert.equal(policy.isAuthorized(stranger), false);
  } finally {
    store.close();
  }
});

test('pairing links contain only a validated Telegram username and opaque code', () => {
  const code = createPairingCode();
  assert.equal(code.length, 32);
  assert.equal(createPairingLink('Daleel_Test_bot', code), `https://t.me/Daleel_Test_bot?start=${code}`);
  assert.throws(() => createPairingLink('../unsafe', code), /username/u);
  assert.throws(() => createPairingLink('valid_bot', 'short'), /pairing code/u);
});
