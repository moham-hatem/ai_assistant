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
    requestId: string,
  ): Promise<AuthPrincipal>;
}

export interface StateChangingRequestOriginGuard {
  assertAllowed(request: IncomingMessage): Promise<void>;
}

export class AdminAuthorizationError extends AppError {
  readonly actorUserId: string | null;

  constructor(
    code: 'FORBIDDEN' | 'UNAUTHENTICATED',
    message: string,
    status: 401 | 403,
    actorUserId: string | null,
  ) {
    super(code, message, status);
    this.name = 'AdminAuthorizationError';
    this.actorUserId = actorUserId;
  }
}

export function unauthenticated(): AppError {
  return new AdminAuthorizationError('UNAUTHENTICATED', 'Authentication is required.', 401, null);
}

export function forbidden(principal: AuthPrincipal | null = null): AppError {
  return new AdminAuthorizationError('FORBIDDEN', 'Permission denied.', 403, principal?.id ?? null);
}
