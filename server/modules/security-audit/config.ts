import { isAbsolute, resolve } from 'node:path';

export interface SecurityAuditConfig {
  currentKeyVersion: string;
  databasePath: string;
  keys: ReadonlyMap<string, Buffer>;
}

export function readSecurityAuditConfig(env: Record<string, string | undefined>, cwd: string): SecurityAuditConfig {
  const value = env.SECURITY_AUDIT_DATABASE_FILE?.trim() || 'data/security-audit.sqlite';
  if (value.includes('\0')) throw new Error('Invalid SECURITY_AUDIT_DATABASE_FILE.');
  const databasePath = value === ':memory:' || isAbsolute(value) ? value : resolve(cwd, value);
  const currentKeyVersion = env.SECURITY_AUDIT_HMAC_KEY_VERSION?.trim() || 'v1';
  if (!/^[A-Za-z0-9._-]{1,32}$/u.test(currentKeyVersion)) throw new Error('Invalid security audit key version.');
  const rawKeys = Object.create(null) as Record<string, unknown>;
  if (env.SECURITY_AUDIT_HMAC_KEYS?.trim()) {
    let parsed: unknown;
    try { parsed = JSON.parse(env.SECURITY_AUDIT_HMAC_KEYS); }
    catch { throw new Error('SECURITY_AUDIT_HMAC_KEYS must be a JSON object.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('SECURITY_AUDIT_HMAC_KEYS must be a JSON object.');
    Object.assign(rawKeys, parsed);
  }
  if (env.SECURITY_AUDIT_HMAC_KEY?.trim()) rawKeys[currentKeyVersion] = env.SECURITY_AUDIT_HMAC_KEY.trim();
  const keys = new Map<string, Buffer>();
  if (Object.keys(rawKeys).length > 8) throw new Error('Too many security audit HMAC keys.');
  for (const [version, encoded] of Object.entries(rawKeys)) {
    if (!/^[A-Za-z0-9._-]{1,32}$/u.test(version) || typeof encoded !== 'string') throw new Error('Invalid security audit HMAC key entry.');
    if (!/^[A-Za-z0-9_-]{43,172}$/u.test(encoded)) throw new Error('Security audit HMAC keys must be unpadded base64url.');
    const key = Buffer.from(encoded, 'base64url');
    if (key.toString('base64url') !== encoded) throw new Error('Invalid security audit HMAC key encoding.');
    if (key.length < 32) throw new Error('Security audit HMAC keys must contain at least 32 bytes.');
    keys.set(version, key);
  }
  if (!keys.has(currentKeyVersion)) throw new Error('SECURITY_AUDIT_HMAC_KEY is required for the current key version.');
  return { currentKeyVersion, databasePath, keys };
}
