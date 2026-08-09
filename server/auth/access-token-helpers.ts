import type { SecretLinkResponse } from '../../shared/contracts/access-management.ts';
import { InvalidAccessInputError } from './access-errors.ts';

const SECRET_WARNING = 'This link is a secret and will not be shown again.' as const;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface AccessTokenServiceOptions {
  invitationTtlMs: number;
  publicOrigin: string;
  recoveryTtlMs: number;
}

export function requireAccessId(value: string): void {
  if (!value || value.length > 128 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new InvalidAccessInputError();
  }
}

export function requireFactoryToken(factory: () => string): string {
  const token = factory();
  if (!TOKEN_PATTERN.test(token)) throw new Error('Access token factory returned an unsafe token.');
  return token;
}

export function parseAccessToken(value: unknown): string | undefined {
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : undefined;
}

export function secretLink(
  publicOrigin: string,
  route: 'password-recovery' | 'password-setup',
  parameter: 'invitation' | 'recovery',
  token: string,
  id: string,
  expiresAt: string,
): SecretLinkResponse {
  return {
    expiresAt,
    id,
    link: `${publicOrigin}/#/${route}?${parameter}=${encodeURIComponent(token)}`,
    warning: SECRET_WARNING,
  };
}
