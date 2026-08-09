import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthPrincipal } from '../../shared/contracts/auth.ts';
import { AppError } from '../errors.ts';
import type { ErrorLogger } from '../http/error-response.ts';
import { sendJson } from '../http/json.ts';
import type {
  AdminRequestAuthorizer,
  StateChangingRequestOriginGuard,
} from './admin-request-authorizer.ts';
import { AdminAuthorizationError } from './admin-request-authorizer.ts';
import { adminRoutePolicy } from './admin-route-policy.ts';
import type { SecurityAuditService } from '../modules/security-audit/service.ts';

export interface AdminApiSecurity {
  authorizer: AdminRequestAuthorizer;
  originGuard: StateChangingRequestOriginGuard;
  audit?: SecurityAuditService;
}

export type AdminGuardResult =
  | { allowed: false; principal: null }
  | { allowed: true; principal: AuthPrincipal | null };

export async function guardAdminRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  security: AdminApiSecurity,
  logError: ErrorLogger,
): Promise<AdminGuardResult> {
  const policy = adminRoutePolicy(request.method, url.pathname);
  if (policy.kind === 'public') return { allowed: true, principal: null };

  const requestId = crypto.randomUUID();
  if (policy.kind === 'denied') {
    await security.audit?.bestEffort({
      action: 'authorization.denied', actorUserId: null, category: 'authorization',
      metadata: { method: request.method?.toUpperCase() ?? 'GET', permission: 'deny-by-default', reason: 'route_policy' },
      outcome: 'denied', requestId, subjectId: null, subjectType: null,
    });
    sendDenied(response, requestId, 403);
    return { allowed: false, principal: null };
  }

  try {
    const principal = await security.authorizer.authorize(request, policy.permission, requestId);
    if (isStateChanging(request.method)) await security.originGuard.assertAllowed(request);
    return { allowed: true, principal };
  } catch (error) {
    if (!(error instanceof AppError)) logError(requestId, error);
    const status = error instanceof AppError && error.status === 401 ? 401
      : error instanceof AppError && error.status === 403 ? 403
      : 503;
    const actorUserId = error instanceof AdminAuthorizationError ? error.actorUserId : null;
    await security.audit?.bestEffort({
      action: 'authorization.denied', actorUserId, category: 'authorization',
      metadata: {
        method: request.method?.toUpperCase() ?? 'GET', permission: policy.permission,
        reason: status === 401 ? 'unauthenticated' : status === 403 ? 'forbidden' : 'unavailable',
      },
      outcome: status === 503 ? 'failure' : 'denied', requestId, subjectId: null, subjectType: null,
    });
    sendDenied(response, requestId, status);
    return { allowed: false, principal: null };
  }
}

function isStateChanging(method: string | undefined): boolean {
  const normalized = method?.toUpperCase();
  return normalized === 'POST'
    || normalized === 'PUT'
    || normalized === 'PATCH'
    || normalized === 'DELETE';
}

function sendDenied(response: ServerResponse, requestId: string, status: 401 | 403 | 503): void {
  if (status === 401) {
    sendJson(response, status, {
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
      requestId,
    });
    return;
  }
  if (status === 403) {
    sendJson(response, status, { code: 'FORBIDDEN', message: 'Permission denied.', requestId });
    return;
  }
  sendJson(response, status, {
    code: 'AUTHORIZATION_UNAVAILABLE',
    message: 'Authorization is temporarily unavailable.',
    requestId,
  });
}
