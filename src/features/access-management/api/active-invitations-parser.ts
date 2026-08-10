import { AUTH_ROLES, type AuthRole } from '../../../../shared/contracts/auth.ts';
import type { ActiveInvitation, ActiveInvitationPage } from '../active-invitation.ts';
import { AccessApiError } from './access-parser.ts';

export function parseActiveInvitationPage(value: unknown): ActiveInvitationPage {
  const payload = object(value, 'invitation page');
  if (!Array.isArray(payload.items)) invalid('items');
  const nextCursor = payload.nextCursor;
  if (nextCursor !== null && (typeof nextCursor !== 'string' || !nextCursor)) invalid('nextCursor');
  return {
    items: payload.items.map(parseActiveInvitation),
    nextCursor: nextCursor as string | null,
  };
}

export function parseActiveInvitation(value: unknown): ActiveInvitation {
  const invitation = object(value, 'invitation');
  if ('link' in invitation || 'token' in invitation || 'hash' in invitation) invalid('secret field');
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
  if (typeof value !== 'string' || !(AUTH_ROLES as readonly string[]).includes(value)) invalid('role');
  return value as AuthRole;
}

function invalid(field: string): never {
  throw new AccessApiError(`Access API returned invalid ${field}.`);
}
