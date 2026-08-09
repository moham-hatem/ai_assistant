export const AUTH_ROLES = ['reviewer', 'content_manager', 'operator', 'admin'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const AUTH_PERMISSIONS = [
  'content:review',
  'content:approve',
  'content:manage',
  'operations:run',
  'users:manage',
  'system:admin',
] as const;

export type AuthPermission = (typeof AUTH_PERMISSIONS)[number];

export interface AuthPrincipal {
  email: string;
  id: string;
  permissions: AuthPermission[];
  roles: AuthRole[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  principal: AuthPrincipal;
  requestId: string;
}

export interface SessionResponse {
  principal: AuthPrincipal | null;
  requestId: string;
}
