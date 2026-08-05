import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AnswerService } from '../answer-service.ts';
import { sendError, type ErrorLogger } from './error-response.ts';
import { readJson, sendJson } from './json.ts';
import { parseAnswerInput } from './parse-input.ts';

export function createAnswerHandler(service: AnswerService, logError: ErrorLogger) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const requestId = crypto.randomUUID();

    if (request.method !== 'POST') {
      sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
      return;
    }

    try {
      const input = parseAnswerInput(await readJson(request));
      const result = await service.answer(input);
      sendJson(response, 200, { ...result, requestId });
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}
