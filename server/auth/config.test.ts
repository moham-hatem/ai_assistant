import assert from 'node:assert/strict';
import test from 'node:test';
import { readAuthConfig } from './config.ts';

test('auth config has bounded local defaults and requires production HTTPS', () => {
  const local = readAuthConfig({});
  assert.equal(local.production, false);
  assert.equal(local.publicOrigin, 'http://localhost:5173');
  assert.equal(local.absoluteTtlMs >= local.idleTtlMs, true);

  assert.throws(() => readAuthConfig({
    AUTH_PUBLIC_ORIGIN: 'http://example.org',
    NODE_ENV: 'production',
  }), /HTTPS/u);
  assert.equal(readAuthConfig({
    AUTH_PUBLIC_ORIGIN: 'https://example.org',
    NODE_ENV: 'production',
  }).production, true);
});

test('auth config rejects path-bearing origins and contradictory TTLs', () => {
  assert.throws(() => readAuthConfig({ AUTH_PUBLIC_ORIGIN: 'https://example.org/path' }));
  assert.throws(() => readAuthConfig({
    AUTH_ABSOLUTE_TTL_MS: '1000',
    AUTH_IDLE_TTL_MS: '2000',
  }));
  assert.throws(() => readAuthConfig({ AUTH_DATABASE_PATH: '' }));
});
