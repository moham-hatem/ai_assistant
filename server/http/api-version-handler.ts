import type { IncomingMessage, ServerResponse } from 'node:http';
import { API_VERSION_CONTRACT } from '../../shared/contracts/api-version.ts';
import { sendJson } from './json.ts';

export function handleApiVersionRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  sendJson(response, 200, API_VERSION_CONTRACT);
}
