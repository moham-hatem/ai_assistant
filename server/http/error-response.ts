import type { ServerResponse } from 'node:http';
import { AppError } from '../errors.ts';
import { sendJson } from './json.ts';

export type ErrorLogger = (requestId: string, error: unknown) => void;

export function sendError(
  response: ServerResponse,
  requestId: string,
  error: unknown,
  logError: ErrorLogger,
) {
  if (error instanceof AppError) {
    sendJson(response, error.status, { code: error.code, message: error.message, requestId });
    return;
  }

  logError(requestId, error);
  sendJson(response, 502, {
    code: 'SERVICE_UNAVAILABLE',
    message: 'تعذر إكمال الطلب الآن.',
    requestId,
  });
}
