import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  SECURITY_AUDIT_ACTIONS,
  SECURITY_AUDIT_CATEGORIES,
  SECURITY_AUDIT_OUTCOMES,
  SECURITY_AUDIT_SUBJECT_TYPES,
  type SecurityAuditAction,
  type SecurityAuditCategory,
  type SecurityAuditOutcome,
  type SecurityAuditSubjectType,
} from '../../../shared/contracts/security-audit.ts';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { sendJson } from '../../http/json.ts';
import type { SecurityAuditQuery } from './repository.ts';
import type { SecurityAuditService } from './service.ts';

const allowedQuery = new Set([
  'action', 'actorUserId', 'category', 'from', 'limit', 'offset', 'outcome',
  'requestId', 'subjectId', 'subjectType', 'to',
]);
const identifier = /^[\p{L}\p{N}._:@/-]{1,128}$/u;
const requestIdentifier = /^[A-Za-z0-9._:-]{1,128}$/u;

export function createSecurityAuditHandler(service: SecurityAuditService, logError: ErrorLogger) {
  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const requestId = crypto.randomUUID();
    try {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
        return;
      }
      if (url.pathname === '/api/internal/security-audit/integrity') {
        rejectQuery(url);
        sendJson(response, 200, { integrity: await service.verifyIntegrity(), requestId });
        return;
      }
      if (url.pathname === '/api/internal/security-audit') {
        sendJson(response, 200, { ...(await service.list(parseQuery(url))), requestId });
        return;
      }
      throw new AppError('ROUTE_NOT_FOUND', 'Security audit route not found.', 404);
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function parseQuery(url: URL): SecurityAuditQuery {
  rejectUnknownQuery(url);
  const query: SecurityAuditQuery = {
    action: enumValue(url, 'action', SECURITY_AUDIT_ACTIONS) as SecurityAuditAction | undefined,
    actorUserId: identifierValue(url, 'actorUserId', identifier),
    category: enumValue(url, 'category', SECURITY_AUDIT_CATEGORIES) as SecurityAuditCategory | undefined,
    from: timestampValue(url, 'from'),
    limit: integerValue(url, 'limit', 50, 1, 100),
    offset: integerValue(url, 'offset', 0, 0, 1_000_000),
    outcome: enumValue(url, 'outcome', SECURITY_AUDIT_OUTCOMES) as SecurityAuditOutcome | undefined,
    requestId: identifierValue(url, 'requestId', requestIdentifier),
    subjectId: identifierValue(url, 'subjectId', identifier),
    subjectType: enumValue(url, 'subjectType', SECURITY_AUDIT_SUBJECT_TYPES) as SecurityAuditSubjectType | undefined,
    to: timestampValue(url, 'to'),
  };
  if (query.from && query.to && query.from > query.to) invalid('from must not be after to.');
  return query;
}

function rejectUnknownQuery(url: URL): void {
  for (const key of url.searchParams.keys()) if (!allowedQuery.has(key)) invalid('Unknown audit filter.');
}

function rejectQuery(url: URL): void {
  if ([...url.searchParams].length) invalid('Integrity endpoint does not accept query parameters.');
}

function enumValue(url: URL, name: string, values: readonly string[]): string | undefined {
  const value = single(url, name);
  if (value === undefined) return undefined;
  if (!values.includes(value)) invalid(`Invalid ${name} filter.`);
  return value;
}

function identifierValue(url: URL, name: string, pattern: RegExp): string | undefined {
  const value = single(url, name);
  if (value === undefined) return undefined;
  if (!pattern.test(value)) invalid(`Invalid ${name} filter.`);
  return value;
}

function timestampValue(url: URL, name: string): string | undefined {
  const value = single(url, name);
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) invalid(`Invalid ${name} filter.`);
  return value;
}

function integerValue(url: URL, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = single(url, name);
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value)) invalid(`Invalid ${name}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) invalid(`Invalid ${name}.`);
  return parsed;
}

function single(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) invalid(`Duplicate ${name} filter.`);
  return values[0];
}

function invalid(message: string): never {
  throw new AppError('INVALID_REQUEST', message, 400);
}
