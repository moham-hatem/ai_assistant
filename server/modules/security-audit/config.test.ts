import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { readSecurityAuditConfig, resolveSecurityAuditConfig } from './config.ts';

test('security audit config requires an external strong key and supports retained key versions', () => {
  assert.throws(() => readSecurityAuditConfig({}, '/workspace'), /required/u);
  const current = randomBytes(32).toString('base64url');
  const old = randomBytes(32).toString('base64url');
  const config = readSecurityAuditConfig({
    SECURITY_AUDIT_HMAC_KEY: current,
    SECURITY_AUDIT_HMAC_KEY_VERSION: 'v2',
    SECURITY_AUDIT_HMAC_KEYS: JSON.stringify({ v1: old }),
  }, '/workspace');
  assert.deepEqual([...config.keys.keys()], ['v1', 'v2']);
  assert.equal(config.currentKeyVersion, 'v2');
});

test('missing key produces an actionable unavailable resolution without blocking public startup', () => {
  const resolution = resolveSecurityAuditConfig({}, '/workspace');
  assert.equal('setupError' in resolution, true);
  if ('setupError' in resolution) {
    assert.match(resolution.setupError, /\.env\.local/u);
    assert.match(resolution.setupError, /32 random bytes/u);
    assert.equal(resolution.setupError.includes('SECURITY_AUDIT_HMAC_KEY='), false);
  }
});
