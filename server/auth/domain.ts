import {
  AUTH_PERMISSIONS,
  AUTH_ROLES,
  type AuthPermission,
  type AuthPrincipal,
  type AuthRole,
} from '../../shared/contracts/auth.ts';

export interface AuthUser {
  createdAt: string;
  displayName: string;
  email: string;
  id: string;
  passwordHash: string;
  roles: AuthRole[];
  updatedAt: string;
}

export interface AuthSession {
  absoluteExpiresAt: string;
  createdAt: string;
  idleExpiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  tokenHash: string;
  userId: string;
}

const permissionsByRole: Record<AuthRole, readonly AuthPermission[]> = {
  reviewer: ['content:review'],
  content_manager: [
    'books:read',
    'books:write',
    'content:review',
    'question_logs:read',
    'quality:read',
  ],
  operator: ['books:read', 'question_logs:read', 'quality:read'],
  admin: ['settings:manage'],
};

export const DISPLAY_NAME_LIMITS = { maxCharacters: 80, maxUtf8Bytes: 160 } as const;
export const LEGACY_DISPLAY_NAME = 'Local User';

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && (AUTH_ROLES as readonly string[]).includes(value);
}

export function normalizeRoles(roles: readonly AuthRole[]): AuthRole[] {
  return AUTH_ROLES.filter((role) => roles.includes(role));
}

export function derivePermissions(roles: readonly AuthRole[]): AuthPermission[] {
  const granted = new Set<AuthPermission>();
  for (const role of normalizeRoles(roles)) {
    for (const permission of permissionsByRole[role]) granted.add(permission);
  }
  return AUTH_PERMISSIONS.filter((permission) => granted.has(permission));
}

export function normalizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const characters = [...normalized].length;
  const utf8Bytes = new TextEncoder().encode(normalized).length;
  if (characters < 1 || characters > DISPLAY_NAME_LIMITS.maxCharacters ||
      utf8Bytes > DISPLAY_NAME_LIMITS.maxUtf8Bytes || /[\p{Cc}\p{Cf}]/u.test(normalized)) {
    return undefined;
  }
  return normalized;
}

export function hasPermission(
  principal: AuthPrincipal | null | undefined,
  permission: AuthPermission,
): boolean {
  return principal?.permissions.includes(permission) ?? false;
}

export function toPrincipal(user: AuthUser): AuthPrincipal {
  const roles = normalizeRoles(user.roles);
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    permissions: derivePermissions(roles),
    roles,
  };
}
