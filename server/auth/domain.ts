import {
  AUTH_ROLES,
  type AuthPermission,
  type AuthPrincipal,
  type AuthRole,
} from '../../shared/contracts/auth.ts';

export interface AuthUser {
  createdAt: string;
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
  reviewer: ['content:review', 'content:approve'],
  content_manager: ['content:review', 'content:approve', 'content:manage'],
  operator: ['operations:run'],
  admin: ['users:manage', 'system:admin'],
};

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
  return [...granted];
}

export function hasPermission(
  principal: AuthPrincipal | null | undefined,
  permission: AuthPermission,
): boolean {
  return principal?.permissions.includes(permission) ?? false;
}

export function toPrincipal(user: AuthUser): AuthPrincipal {
  const roles = normalizeRoles(user.roles);
  return { email: user.email, id: user.id, permissions: derivePermissions(roles), roles };
}
