import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { readJson, sendJson } from '../../http/json.ts';
import { parseFeedbackList, parseSubmitFeedback, validFeedbackId } from './feedback-input.ts';
import type { FeedbackService } from './feedback-service.ts';

export function createFeedbackHandler(service: FeedbackService, logError: ErrorLogger) {
  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const requestId = crypto.randomUUID();
    try {
      if (url.pathname === '/api/feedback') {
        if (request.method !== 'POST') return methodNotAllowed(response, requestId);
        const result = await service.submit(parseSubmitFeedback(await readJson(request)));
        sendJson(response, 201, { ...result, requestId });
        return;
      }

      if (url.pathname === '/api/internal/feedback') {
        if (request.method !== 'GET') return methodNotAllowed(response, requestId);
        sendJson(response, 200, { ...(await service.list(parseFeedbackList(url))), requestId });
        return;
      }

      const detail = url.pathname.match(/^\/api\/internal\/feedback\/([^/]+)$/u)?.[1];
      if (detail) {
        if (request.method !== 'GET') return methodNotAllowed(response, requestId);
        sendJson(response, 200, {
          ...(await service.getDetail(validFeedbackId(detail))),
          requestId,
        });
        return;
      }
      throw new AppError('ROUTE_NOT_FOUND', 'Internal feedback route not found.', 404);
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function methodNotAllowed(response: ServerResponse, requestId: string): void {
  sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
}
