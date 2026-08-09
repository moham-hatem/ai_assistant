import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LoginRequest } from '../../shared/contracts/auth.ts';
import {
  readSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  type AuthCookiePolicy,
} from './cookie.ts';
import type { AuthOriginPolicy } from './origin.ts';
import {
  AuthService,
  InvalidCredentialsError,
  TooManyLoginAttemptsError,
} from './service.ts';
import { AppError } from '../errors.ts';

export const AUTH_API_PATHS = {
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  session: '/api/auth/session',
} as const;

export type AuthErrorLogger = (requestId: string, error: unknown) => void;

export function createAuthHandler(
  service: AuthService,
  cookie: AuthCookiePolicy,
  origin: AuthOriginPolicy,
  absoluteTtlMs: number,
  logError: AuthErrorLogger = () => undefined,
): (request: IncomingMessage, response: ServerResponse, pathname: string) => Promise<boolean> {
  return async (request, response, pathname) => {
    if (!Object.values(AUTH_API_PATHS).includes(pathname as never)) return false;
    const requestId = randomUUID();
    secureHeaders(response, requestId);
    try {
      if (pathname === AUTH_API_PATHS.login) {
        if (!requireMethod(request, response, 'POST', requestId) ||
            !requireSameOrigin(request, response, origin, requestId)) return true;
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch {
          sendJson(response, 400, { code: 'INVALID_REQUEST', requestId });
          return true;
        }
        const login = body as Partial<LoginRequest> | null;
        try {
          const result = await service.login({
            email: login?.email,
            password: login?.password,
            previousSessionToken: readSessionCookie(request.headers, cookie),
            rateLimitKey: request.socket.remoteAddress ?? 'unknown',
            requestId,
          });
          response.setHeader(
            'Set-Cookie',
            serializeSessionCookie(cookie, result.sessionToken, absoluteTtlMs / 1_000),
          );
          sendJson(response, 200, { principal: result.principal, requestId });
        } catch (error) {
          if (error instanceof InvalidCredentialsError) {
            sendJson(response, 401, { code: 'INVALID_CREDENTIALS', requestId });
          } else if (error instanceof TooManyLoginAttemptsError) {
            response.setHeader('Retry-After', String(error.retryAfterSeconds));
            sendJson(response, 429, { code: 'TOO_MANY_ATTEMPTS', requestId });
          } else {
            throw error;
          }
        }
        return true;
      }

      if (pathname === AUTH_API_PATHS.session) {
        if (!requireMethod(request, response, 'GET', requestId)) return true;
        const token = readSessionCookie(request.headers, cookie);
        const principal = await service.getPrincipal(token, requestId);
        if (token && !principal) {
          response.setHeader('Set-Cookie', serializeClearedSessionCookie(cookie));
        }
        sendJson(response, 200, { principal, requestId });
        return true;
      }

      if (!requireMethod(request, response, 'POST', requestId) ||
          !requireSameOrigin(request, response, origin, requestId)) return true;
      await service.logout(readSessionCookie(request.headers, cookie), requestId);
      response.setHeader('Set-Cookie', serializeClearedSessionCookie(cookie));
      response.statusCode = 204;
      response.end();
      return true;
    } catch (error) {
      logError(requestId, error);
      if (!response.headersSent && error instanceof AppError
          && error.code === 'SECURITY_AUDIT_UNAVAILABLE') {
        sendJson(response, 503, { code: error.code, requestId });
      } else if (!response.headersSent) sendJson(response, 500, { code: 'INTERNAL_ERROR', requestId });
      else response.destroy();
      return true;
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
  response.setHeader('Allow', method);
  sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
  return false;
}

function requireSameOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  policy: AuthOriginPolicy,
  requestId: string,
): boolean {
  if (policy.allows(request)) return true;
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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new Error('Expected JSON.');
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > 4_096) throw new Error('Body too large.');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 4_096) throw new Error('Body too large.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
