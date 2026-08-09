import { AUTH_PERMISSIONS, AUTH_ROLES, type AuthPrincipal, type LoginResponse, type SessionResponse } from '../../../shared/contracts/auth.ts';

export class AuthParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthParseError';
  }
}

export function parseLoginResponse(value: unknown): LoginResponse {
  const body = record(value, 'login response');
  return { principal: parsePrincipal(body.principal), requestId: string(body.requestId, 'requestId') };
}

export function parseSessionResponse(value: unknown): SessionResponse {
  const body = record(value, 'session response');
  return {
    principal: body.principal === null ? null : parsePrincipal(body.principal),
    requestId: string(body.requestId, 'requestId'),
  };
}

export function parsePrincipal(value: unknown): AuthPrincipal {
  const body = record(value, 'principal');
  return {
    id: string(body.id, 'principal.id'),
    email: string(body.email, 'principal.email'),
    displayName: string(body.displayName, 'principal.displayName'),
    roles: knownStrings(body.roles, AUTH_ROLES, 'principal.roles'),
    permissions: knownStrings(body.permissions, AUTH_PERMISSIONS, 'principal.permissions'),
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthParseError(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AuthParseError(`Invalid ${label}.`);
  return value.trim();
}

function knownStrings<T extends string>(value: unknown, allowed: readonly T[], label: string): T[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !allowed.includes(item as T))) {
    throw new AuthParseError(`Invalid ${label}.`);
  }
  return [...new Set(value)] as T[];
}
