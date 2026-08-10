import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { sendJson } from '../../http/json.ts';
import type { SystemDiagnosticsService } from './service.ts';

type SystemDiagnosticsReader = Pick<SystemDiagnosticsService, 'inspect'>;

export function createSystemDiagnosticsHandler(
  service: SystemDiagnosticsReader,
  logError: ErrorLogger,
) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    _principal?: unknown,
    boundaryRequestId: string = crypto.randomUUID(),
  ) => {
    const requestId = boundaryRequestId;
    try {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
        return;
      }
      if (url.pathname !== '/api/internal/system-diagnostics') {
        throw new AppError('ROUTE_NOT_FOUND', 'System diagnostics route not found.', 404);
      }
      if ([...url.searchParams].length > 0) {
        throw new AppError('INVALID_REQUEST', 'System diagnostics does not accept query parameters.', 400);
      }
      sendJson(response, 200, { diagnostics: await service.inspect(), requestId });
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}
