import { createHash, randomBytes } from 'node:crypto';

export function createSessionToken(bytes = 32): string {
  if (!Number.isSafeInteger(bytes) || bytes < 32) {
    throw new Error('Session tokens require at least 256 bits of entropy.');
  }
  return randomBytes(bytes).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
