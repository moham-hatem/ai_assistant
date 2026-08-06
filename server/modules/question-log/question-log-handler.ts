import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { sendJson } from '../../http/json.ts';
import type { QuestionLogRepository } from './question-log-repository.ts';

const defaultLimit = 25;
const maximumLimit = 100;
const maximumOffset = 1_000_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createQuestionLogHandler(
  repository: QuestionLogRepository,
  logError: ErrorLogger,
) {
  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const requestId = crypto.randomUUID();

    try {
      if (request.method !== 'GET') {
        sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
        return;
      }

      if (url.pathname === '/api/internal/question-logs') {
        const query = {
          limit: parseInteger(url.searchParams.get('limit'), defaultLimit, maximumLimit, 1),
          offset: parseInteger(url.searchParams.get('offset'), 0, maximumOffset),
        };
        sendJson(response, 200, { ...(await repository.list(query)), requestId });
        return;
      }

      const encodedId = url.pathname.match(/^\/api\/internal\/question-logs\/([^/]+)$/u)?.[1];
      const id = encodedId ? decodeId(encodedId) : '';
      if (!uuidPattern.test(id)) invalidRequest();
      const record = await repository.findById(id);
      if (!record) {
        sendJson(response, 404, { code: 'QUESTION_LOG_NOT_FOUND', requestId });
        return;
      }
      sendJson(response, 200, { record, requestId });
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function parseInteger(
  value: string | null,
  fallback: number,
  maximum: number,
  minimum = 0,
): number {
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value)) invalidRequest();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) invalidRequest();
  return parsed;
}

function invalidRequest(): never {
  throw new AppError('INVALID_REQUEST', 'Invalid question log query.', 400);
}

function decodeId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    invalidRequest();
  }
}
