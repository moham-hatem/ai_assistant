import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';
import {
  createAuthCookiePolicy,
  readSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from './cookie.ts';
import { SameOriginAuthPolicy } from './origin.ts';

test('production and development cookies have isolated secure attributes', () => {
  const production = createAuthCookiePolicy({
    production: true,
    publicOrigin: 'https://learning.example.org',
  });
  const development = createAuthCookiePolicy({
    production: false,
    publicOrigin: 'http://127.0.0.1:5173',
  });
  const token = 'a'.repeat(43);
  const productionCookie = serializeSessionCookie(production, token, 3_600);
  assert.match(productionCookie, /^__Host-ila_session=/u);
  for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Secure']) {
    assert.equal(productionCookie.includes(attribute), true);
  }
  assert.equal(productionCookie.includes('Domain='), false);
  assert.match(serializeClearedSessionCookie(production), /Max-Age=0/u);
  assert.match(serializeSessionCookie(development, token, 60), /^ila_local_session=/u);
  assert.equal(serializeSessionCookie(development, token, 60).includes('Secure'), false);
  assert.throws(() => createAuthCookiePolicy({
    production: true,
    publicOrigin: 'http://learning.example.org',
  }));
});

test('cookie parser rejects fixation through duplicate or malformed cookie values', () => {
  const policy = { name: 'ila_local_session', secure: false };
  const token = 'a'.repeat(43);
  assert.equal(readSessionCookie({ cookie: `other=x; ila_local_session=${token}` }, policy), token);
  assert.equal(readSessionCookie({
    cookie: `ila_local_session=${token}; ila_local_session=${'b'.repeat(43)}`,
  }, policy), undefined);
  assert.equal(readSessionCookie({ cookie: 'ila_local_session=bad token' }, policy), undefined);
});

test('origin policy requires an exact configured origin and rejects absent or opaque origins', () => {
  const policy = new SameOriginAuthPolicy('https://learning.example.org');
  assert.equal(policy.allows(requestWithOrigin('https://learning.example.org')), true);
  assert.equal(policy.allows(requestWithOrigin('https://evil.example.org')), false);
  assert.equal(policy.allows(requestWithOrigin('https://learning.example.org.evil.test')), false);
  assert.equal(policy.allows(requestWithOrigin('null')), false);
  assert.equal(policy.allows(requestWithOrigin(undefined)), false);
});

function requestWithOrigin(origin: string | undefined): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage;
  request.headers = origin === undefined ? {} : { origin };
  return request;
}
