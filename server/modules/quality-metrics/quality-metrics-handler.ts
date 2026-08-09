import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { sendJson } from '../../http/json.ts';
import { parseQualityMetricsQuery } from './quality-metrics-query.ts';
import type { QualityMetricsService } from './quality-metrics-service.ts';

export function createQualityMetricsHandler(
  service: QualityMetricsService,
  logError: ErrorLogger,
) {
  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const requestId = crypto.randomUUID();
    try {
      if (request.method !== 'GET') {
        sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
        return;
      }
      if (url.pathname !== '/api/internal/quality-metrics') {
        throw new AppError('ROUTE_NOT_FOUND', 'Quality metrics route not found.', 404);
      }
      sendJson(response, 200, await service.getMetrics(parseQualityMetricsQuery(url), requestId));
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}
