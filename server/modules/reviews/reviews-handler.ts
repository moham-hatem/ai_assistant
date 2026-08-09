import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthPrincipal } from '../../../shared/contracts/auth.ts';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { readJson, sendJson } from '../../http/json.ts';
import {
  parseCreateReview,
  parseDecision,
  parseReviewList,
  parseStatusChange,
  validReviewId,
} from './review-input.ts';
import type { ReviewService } from './review-service.ts';

export function createReviewsHandler(service: ReviewService, logError: ErrorLogger) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    principal: AuthPrincipal | null,
  ) => {
    const requestId = crypto.randomUUID();
    try {
      if (url.pathname === '/api/internal/reviews') {
        if (request.method === 'GET') {
          sendJson(response, 200, { ...(await service.listReviews(parseReviewList(url))), requestId });
          return;
        }
        if (request.method === 'POST') {
          const { questionLogId } = parseCreateReview(await readJson(request));
          sendJson(response, 201, { review: await service.createReview(questionLogId), requestId });
          return;
        }
        return methodNotAllowed(response, requestId);
      }

      const detail = matchPath(url.pathname, /^\/api\/internal\/reviews\/([^/]+)$/u);
      if (detail) {
        if (request.method !== 'GET') return methodNotAllowed(response, requestId);
        sendJson(response, 200, { review: await service.getReview(validReviewId(detail[0])), requestId });
        return;
      }

      const status = matchPath(url.pathname, /^\/api\/internal\/reviews\/([^/]+)\/status$/u);
      if (status) {
        if (request.method !== 'POST') return methodNotAllowed(response, requestId);
        const input = parseStatusChange(await readJson(request));
        const review = await service.transitionStatus(
          validReviewId(status[0]),
          input.status,
          requirePrincipal(principal).id,
          { actorUserId: requirePrincipal(principal).id, requestId },
        );
        sendJson(response, 200, { review, requestId });
        return;
      }

      const decision = matchPath(url.pathname, /^\/api\/internal\/reviews\/([^/]+)\/decision$/u);
      if (decision) {
        if (request.method !== 'POST') return methodNotAllowed(response, requestId);
        const review = await service.saveDecision(
          validReviewId(decision[0]),
          { ...parseDecision(await readJson(request)), reviewerId: requirePrincipal(principal).id },
          { actorUserId: requirePrincipal(principal).id, requestId },
        );
        sendJson(response, 200, { review, requestId });
        return;
      }
      throw new AppError('ROUTE_NOT_FOUND', 'Internal review route not found.', 404);
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function requirePrincipal(principal: AuthPrincipal | null): AuthPrincipal {
  if (!principal) throw new AppError('UNAUTHENTICATED', 'Authentication is required.', 401);
  return principal;
}

function matchPath(path: string, pattern: RegExp): string[] | undefined {
  const match = path.match(pattern);
  return match ? match.slice(1) : undefined;
}

function methodNotAllowed(response: ServerResponse, requestId: string): void {
  sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
}
