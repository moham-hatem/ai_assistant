import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { readSecurityAuditConfig } from './config.ts';

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
