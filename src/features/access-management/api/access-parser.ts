import type {
  AccessUserDetails,
  AccessUserPage,
  AccessUserSummary,
  SecretLinkResponse,
} from '../../../../shared/contracts/access-management.ts';
import { AUTH_ROLES, type AuthRole } from '../../../../shared/contracts/auth.ts';

export class AccessApiError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, status: number | null = null, code = 'INVALID_RESPONSE') {
    super(message);
    this.name = 'AccessApiError';
    this.code = code;
    this.status = status;
  }
}

export function parseAccessUserPage(value: unknown): AccessUserPage {
  const payload = object(value, 'user page');
  if (!Array.isArray(payload.items)) invalid('items');
  const nextCursor = payload.nextCursor;
  if (nextCursor !== null && (typeof nextCursor !== 'string' || !nextCursor)) {
    invalid('nextCursor');
  }
  return { items: payload.items.map(parseAccessUser), nextCursor: nextCursor as string | null };
}

export function parseAccessUserDetails(value: unknown): AccessUserDetails {
  return parseAccessUser(object(value, 'user detail').user);
}

export function parseAccessUserAction(value: unknown): AccessUserDetails {
  return parseAccessUserDetails(value);
}

export function parseSecretLink(value: unknown): SecretLinkResponse {
  const payload = object(value, 'secret link');
  const warning = requiredString(payload.warning, 'warning');
  if (warning !== 'This link is a secret and will not be shown again.') invalid('warning');
  return {
    expiresAt: date(payload.expiresAt, 'expiresAt'),
    id: requiredString(payload.id, 'id'),
    link: requiredString(payload.link, 'link'),
    warning,
  };
}

function parseAccessUser(value: unknown): AccessUserSummary {
  const user = object(value, 'user');
  if (typeof user.enabled !== 'boolean') invalid('enabled');
  if (!Array.isArray(user.roles) || user.roles.length < 1) invalid('roles');
  const roles = user.roles.map(role);
  if (new Set(roles).size !== roles.length) invalid('roles');
  return {
    createdAt: date(user.createdAt, 'createdAt'),
    displayName: requiredString(user.displayName, 'displayName'),
    email: requiredString(user.email, 'email'),
    enabled: user.enabled,
    id: requiredString(user.id, 'id'),
    roles,
    updatedAt: date(user.updatedAt, 'updatedAt'),
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) invalid(field);
  return value;
}

function date(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (Number.isNaN(Date.parse(parsed))) invalid(field);
  return parsed;
}

function role(value: unknown): AuthRole {
  if (typeof value !== 'string' || !(AUTH_ROLES as readonly string[]).includes(value)) {
    invalid('role');
  }
  return value as AuthRole;
}

function invalid(field: string): never {
  throw new AccessApiError(`Access API returned invalid ${field}.`);
}
