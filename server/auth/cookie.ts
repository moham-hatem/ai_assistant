import type { IncomingHttpHeaders } from 'node:http';

export interface AuthCookiePolicy {
  name: string;
  secure: boolean;
}

export function createAuthCookiePolicy(input: {
  production: boolean;
  publicOrigin: string;
}): AuthCookiePolicy {
  const https = new URL(input.publicOrigin).protocol === 'https:';
  if (input.production && !https) throw new Error('Production auth cookies require HTTPS.');
  return input.production
    ? { name: '__Host-ila_session', secure: true }
    : { name: 'ila_local_session', secure: false };
}

export function serializeSessionCookie(
  policy: AuthCookiePolicy,
  token: string,
  maxAgeSeconds: number,
): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(token)) throw new Error('Invalid session token.');
  const parts = [
    `${policy.name}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (policy.secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeClearedSessionCookie(policy: AuthCookiePolicy): string {
  const parts = [
    `${policy.name}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (policy.secure) parts.push('Secure');
  return parts.join('; ');
}

export function readSessionCookie(
  headers: IncomingHttpHeaders,
  policy: AuthCookiePolicy,
): string | undefined {
  const header = headers.cookie;
  if (!header || header.length > 8_192) return undefined;
  const matches: string[] = [];
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== policy.name) continue;
    matches.push(part.slice(separator + 1).trim());
  }
  if (matches.length !== 1 || !/^[A-Za-z0-9_-]{40,512}$/u.test(matches[0])) return undefined;
  return matches[0];
}
