import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from '../errors.ts';
import type { ErrorLogger } from '../http/error-response.ts';
import { sendJson } from '../http/json.ts';
import type {
  AdminRequestAuthorizer,
  StateChangingRequestOriginGuard,
} from './admin-request-authorizer.ts';
import { adminRoutePolicy } from './admin-route-policy.ts';

export interface AdminApiSecurity {
  authorizer: AdminRequestAuthorizer;
  originGuard: StateChangingRequestOriginGuard;
}

export async function guardAdminRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  security: AdminApiSecurity,
  logError: ErrorLogger,
): Promise<boolean> {
  const policy = adminRoutePolicy(request.method, url.pathname);
  if (policy.kind === 'public') return true;

  const requestId = crypto.randomUUID();
  if (policy.kind === 'denied') {
    sendDenied(response, requestId, 403);
    return false;
  }

  try {
    await security.authorizer.authorize(request, policy.permission);
    if (isStateChanging(request.method)) await security.originGuard.assertAllowed(request);
    return true;
  } catch (error) {
    if (!(error instanceof AppError)) logError(requestId, error);
    const status = error instanceof AppError && error.status === 401 ? 401
      : error instanceof AppError && error.status === 403 ? 403
      : 503;
    sendDenied(response, requestId, status);
    return false;
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
