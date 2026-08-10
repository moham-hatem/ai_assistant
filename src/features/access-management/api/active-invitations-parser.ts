import { AUTH_ROLES, type AuthRole } from '../../../../shared/contracts/auth.ts';
import type { ActiveInvitation, ActiveInvitationPage } from '../active-invitation.ts';
import { AccessApiError } from './access-parser.ts';

export function parseActiveInvitationPage(value: unknown): ActiveInvitationPage {
  const payload = exactObject(value, ['items', 'nextCursor', 'requestId'], 'invitation page');
  if (!Array.isArray(payload.items)) invalid('items');
  requiredString(payload.requestId, 'requestId');
  const nextCursor = payload.nextCursor;
  if (nextCursor !== null && (typeof nextCursor !== 'string' || !nextCursor)) invalid('nextCursor');
  return {
    items: payload.items.map(parseActiveInvitation),
    nextCursor: nextCursor as string | null,
  };
}

export function parseActiveInvitation(value: unknown): ActiveInvitation {
  const invitation = exactObject(value, [
    'createdAt', 'displayName', 'email', 'expiresAt', 'id', 'roles', 'status',
  ], 'invitation');
  if (invitation.status !== 'active') invalid('status');
  if (!Array.isArray(invitation.roles) || invitation.roles.length < 1) invalid('roles');
  const roles = invitation.roles.map(role);
  if (new Set(roles).size !== roles.length) invalid('roles');
  return {
    createdAt: date(invitation.createdAt, 'createdAt'),
    displayName: requiredString(invitation.displayName, 'displayName'),
    email: requiredString(invitation.email, 'email'),
    expiresAt: date(invitation.expiresAt, 'expiresAt'),
    id: requiredString(invitation.id, 'id'),
    roles,
    status: 'active',
  };
}

function exactObject(
  value: unknown,
  expectedKeys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) invalid(field);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) =>
    typeof key !== 'string' || !expectedKeys.includes(key))) invalid(field);
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) invalid(field);
  }
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
  if (typeof value !== 'string' || !(AUTH_ROLES as readonly string[]).includes(value)) invalid('role');
  return value as AuthRole;
}

function invalid(field: string): never {
  throw new AccessApiError(`Access API returned invalid ${field}.`);
}
