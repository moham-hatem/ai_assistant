import type { AdminPage } from '../../app/routes.ts';
import type { AuthPermission, AuthPrincipal } from '../../../shared/contracts/auth.ts';

export const pagePermission: Partial<Record<AdminPage, AuthPermission>> = {
  books: 'books:read', reviews: 'content:review', 'question-logs': 'question_logs:read',
  quality: 'quality:read', access: 'settings:manage', settings: 'settings:manage',
};

export function hasPermission(principal: AuthPrincipal, permission: AuthPermission): boolean {
  return principal.permissions.includes(permission);
}

export function canOpenAdminPage(principal: AuthPrincipal, page: AdminPage): boolean {
  const permission = pagePermission[page];
  return permission ? hasPermission(principal, permission) : true;
}

export function canWriteBooks(principal: AuthPrincipal): boolean {
  return hasPermission(principal, 'books:write');
}

export function canApproveContentReview(principal: AuthPrincipal): boolean {
  return hasPermission(principal, 'content:review');
}
