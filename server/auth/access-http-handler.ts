import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthPrincipal } from '../../shared/contracts/auth.ts';
import {
  AccessHttpInputError,
  decodeAccessPathSegment,
  matchAccessPath,
  readStrictAccessJson,
  requireEmptyAccessJson,
  requireOnlyAccessQuery,
} from './access-http-input.ts';
import type { AuthOriginPolicy } from './origin.ts';
import { PasswordPolicyError } from './password.ts';
import {
  AccessConflictError,
  AccessLockoutError,
  AccessRateLimitError,
  AccessService,
  AccessTokenRejectedError,
  AccessUserNotFoundError,
  InvalidAccessInputError,
} from './access-service.ts';
import type { AuthErrorLogger } from './http-handler.ts';

export const ACCESS_API_PATHS = {
  invitations: '/api/internal/access/invitations',
  redeemInvitation: '/api/auth/invitations/redeem',
  redeemRecovery: '/api/auth/recovery/redeem',
  users: '/api/internal/access/users',
} as const;

export function createAccessHandler(
  service: AccessService,
  origin: AuthOriginPolicy,
  logError: AuthErrorLogger = () => undefined,
) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    principal: AuthPrincipal | null,
  ): Promise<void> => {
    const requestId = randomUUID();
    secureHeaders(response, requestId);
    try {
      if (url.pathname === ACCESS_API_PATHS.redeemInvitation ||
          url.pathname === ACCESS_API_PATHS.redeemRecovery) {
        if (!requireMethod(request, response, 'POST', requestId) ||
            !requireOrigin(request, response, origin, requestId)) return;
        const body = await readStrictAccessJson(request, ['password', 'token']);
        const redeem = url.pathname === ACCESS_API_PATHS.redeemInvitation
          ? service.redeemInvitation.bind(service)
          : service.redeemRecovery.bind(service);
        await redeem(body.token, body.password, request.socket.remoteAddress ?? 'unknown');
        response.statusCode = 204;
        response.end();
        return;
      }

      if (!principal) {
        sendJson(response, 401, { code: 'UNAUTHENTICATED', requestId });
        return;
      }

      if (url.pathname === ACCESS_API_PATHS.users) {
        if (!requireMethod(request, response, 'GET', requestId)) return;
        requireOnlyAccessQuery(url, ['cursor', 'limit']);
        const page = await service.listUsers(
          url.searchParams.get('cursor'), url.searchParams.get('limit'),
        );
        sendJson(response, 200, { ...page, requestId });
        return;
      }

      if (url.pathname === ACCESS_API_PATHS.invitations) {
        if (!requireMethod(request, response, 'POST', requestId)) return;
        const body = await readStrictAccessJson(request, ['displayName', 'email', 'roles']);
        const secret = await service.createInvitation(principal.id, {
          displayName: body.displayName,
          email: body.email,
          roles: body.roles,
        });
        sendJson(response, 201, { ...secret, requestId });
        return;
      }

      const invitationRevoke = matchAccessPath(
        url.pathname, /^\/api\/internal\/access\/invitations\/([^/]+)\/revoke$/u,
      );
      if (invitationRevoke) {
        if (!requireMethod(request, response, 'POST', requestId)) return;
        await requireEmptyAccessJson(request);
        await service.revokeInvitation(invitationRevoke);
        response.statusCode = 204;
        response.end();
        return;
      }

      const recoveryRevoke = matchAccessPath(
        url.pathname, /^\/api\/internal\/access\/recoveries\/([^/]+)\/revoke$/u,
      );
      if (recoveryRevoke) {
        if (!requireMethod(request, response, 'POST', requestId)) return;
        await requireEmptyAccessJson(request);
        await service.revokeRecovery(recoveryRevoke);
        response.statusCode = 204;
        response.end();
        return;
      }

      const action = /^\/api\/internal\/access\/users\/([^/]+)\/(enable|disable|revoke-sessions|recovery)$/u
        .exec(url.pathname);
      if (action) {
        if (!requireMethod(request, response, 'POST', requestId)) return;
        await requireEmptyAccessJson(request);
        const userId = decodeAccessPathSegment(action[1]);
        if (action[2] === 'revoke-sessions') {
          await service.revokeAllSessions(userId);
          response.statusCode = 204;
          response.end();
        } else if (action[2] === 'recovery') {
          const secret = await service.createRecovery(principal.id, userId);
          sendJson(response, 201, { ...secret, requestId });
        } else {
          const user = await service.setEnabled(principal.id, userId, action[2] === 'enable');
          sendJson(response, 200, { user, requestId });
        }
        return;
      }

      const userId = matchAccessPath(url.pathname, /^\/api\/internal\/access\/users\/([^/]+)$/u);
      if (userId) {
        if (request.method === 'GET') {
          sendJson(response, 200, { user: await service.getUser(userId), requestId });
          return;
        }
        if (request.method === 'PATCH') {
          const body = await readStrictAccessJson(request, ['displayName', 'roles']);
          const user = await service.updateUser(principal.id, userId, {
            displayName: body.displayName,
            roles: body.roles,
          });
          sendJson(response, 200, { user, requestId });
          return;
        }
        methodNotAllowed(response, 'GET, PATCH', requestId);
        return;
      }

      sendJson(response, 404, { code: 'NOT_FOUND', requestId });
    } catch (error) {
      if (error instanceof AccessHttpInputError || error instanceof InvalidAccessInputError ||
          error instanceof PasswordPolicyError) {
        sendJson(response, 400, { code: 'INVALID_REQUEST', requestId });
      } else if (error instanceof AccessTokenRejectedError) {
        sendJson(response, 400, { code: 'INVALID_OR_EXPIRED_TOKEN', requestId });
      } else if (error instanceof AccessRateLimitError) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
        sendJson(response, 429, { code: 'TOO_MANY_ATTEMPTS', requestId });
      } else if (error instanceof AccessUserNotFoundError) {
        sendJson(response, 404, { code: 'NOT_FOUND', requestId });
      } else if (error instanceof AccessConflictError) {
        sendJson(response, 409, { code: 'ACCESS_OPERATION_REJECTED', requestId });
      } else if (error instanceof AccessLockoutError) {
        sendJson(response, 409, { code: 'LOCKOUT_PREVENTED', requestId });
      } else {
        logError(requestId, error);
        if (!response.headersSent) sendJson(response, 500, { code: 'INTERNAL_ERROR', requestId });
        else response.destroy();
      }
    }
  };
}

function requireMethod(
  request: IncomingMessage,
  response: ServerResponse,
  method: 'GET' | 'POST',
  requestId: string,
): boolean {
  if (request.method === method) return true;
  methodNotAllowed(response, method, requestId);
  return false;
}

function methodNotAllowed(response: ServerResponse, allow: string, requestId: string): void {
  response.setHeader('Allow', allow);
  sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
}

function requireOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  origin: AuthOriginPolicy,
  requestId: string,
): boolean {
  if (origin.allows(request)) return true;
  sendJson(response, 403, { code: 'FORBIDDEN', requestId });
  return false;
}

function secureHeaders(response: ServerResponse, requestId: string): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Request-Id', requestId);
  response.setHeader('Vary', 'Origin');
}

function sendJson(response: ServerResponse, status: number, body: object): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
