import type { IncomingMessage } from 'node:http';
import { AppError } from '../errors.ts';

export type AdminPermission =
  | 'books:read'
  | 'books:write'
  | 'content:review'
  | 'question_logs:read'
  | 'quality:read'
  | 'settings:manage';

export interface AuthenticatedPrincipal {
  readonly subject: string;
}

/**
 * Authentication, session validation, and role-to-permission mapping belong to
 * the adapter. The HTTP layer asks only whether this request has one permission.
 * Implementations resolve an authenticated principal or reject with a sanitized
 * AppError (401 for absent/invalid authentication, 403 for missing permission).
 */
export interface AdminRequestAuthorizer {
  authorize(
    request: IncomingMessage,
    permission: AdminPermission,
  ): Promise<AuthenticatedPrincipal>;
}

export interface StateChangingRequestOriginGuard {
  assertAllowed(request: IncomingMessage): Promise<void>;
}

export function unauthenticated(): AppError {
  return new AppError('UNAUTHENTICATED', 'Authentication is required.', 401);
}

export function forbidden(): AppError {
  return new AppError('FORBIDDEN', 'Permission denied.', 403);
}
