import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AnswerRequestService } from '../answer-request-service.ts';
import { sendError, type ErrorLogger } from './error-response.ts';
import { readJson, sendJson } from './json.ts';
import { parseAnswerInput } from './parse-input.ts';

export function createAnswerHandler(
  service: AnswerRequestService,
  logError: ErrorLogger,
) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    let requestId: string = crypto.randomUUID();

    if (request.method !== 'POST') {
      sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
      return;
    }

    try {
      const result = await service.answer(parseAnswerInput(await readJson(request)), 'web');
      requestId = result.requestId;
      sendJson(response, 200, result);
    } catch (error) {
      requestId = service.requestIdFor(error) ?? requestId;
      sendError(response, requestId, error, logError);
    }
  };
}
