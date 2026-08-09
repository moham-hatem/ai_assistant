import type { IncomingMessage } from 'node:http';
import type { AuthPermission, AuthPrincipal } from '../../shared/contracts/auth.ts';
import { AppError } from '../errors.ts';

/**
 * Authentication, session validation, and role-to-permission mapping belong to
 * the adapter. The HTTP layer asks only whether this request has one permission.
 * Implementations resolve an authenticated principal or reject with a sanitized
 * AppError (401 for absent/invalid authentication, 403 for missing permission).
 */
export interface AdminRequestAuthorizer {
  authorize(
    request: IncomingMessage,
    permission: AuthPermission,
  ): Promise<AuthPrincipal>;
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
