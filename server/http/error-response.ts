import type { ServerResponse } from 'node:http';
import { AppError } from '../errors.ts';
import { sendJson } from './json.ts';

export type ErrorLogger = (requestId: string, error: unknown) => void;

export interface PublicErrorResponse {
  body: { code: string; message?: string; requestId: string };
  status: number;
}

export function createPublicErrorResponse(
  requestId: string,
  error: unknown,
): PublicErrorResponse {
  if (error instanceof AppError) {
    return {
      body: { code: error.code, message: error.message, requestId },
      status: error.status,
    };
  }

  return {
    body: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'تعذر إكمال الطلب الآن.',
      requestId,
    },
    status: 502,
  };
}

export function sendError(
  response: ServerResponse,
  requestId: string,
  error: unknown,
  logError: ErrorLogger,
) {
  if (!(error instanceof AppError)) logError(requestId, error);
  const publicError = createPublicErrorResponse(requestId, error);
  sendJson(response, publicError.status, publicError.body);
}
