import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthPrincipal } from '../../shared/contracts/auth.ts';
import type { Plugin } from 'vite';
import type { AuthConfig } from '../auth/config.ts';
import type { createAuthHandler } from '../auth/http-handler.ts';
import { createLocalAuthRuntime } from '../auth/runtime.ts';
import type { LocalRuntimeConfig } from '../config.ts';
import { createRuntime } from '../create-runtime.ts';
import { createAnswerHandler } from '../http/answer-handler.ts';
import { handleApiVersionRequest } from '../http/api-version-handler.ts';
import { createDocumentsHandler } from '../http/documents-handler.ts';
import type { ErrorLogger } from '../http/error-response.ts';
import { createBooksHandler } from '../modules/books/books-handler.ts';
import { createFeedbackHandler } from '../modules/feedback/feedback-handler.ts';
import { createQualityMetricsHandler } from '../modules/quality-metrics/quality-metrics-handler.ts';
import { createQuestionLogHandler } from '../modules/question-log/question-log-handler.ts';
import { createReviewsHandler } from '../modules/reviews/reviews-handler.ts';
import {
  guardAdminRequest,
  type AdminApiSecurity,
} from '../security/admin-authorization-guard.ts';
import { createRuntimeAdminSecurity } from '../security/runtime-admin-security.ts';

type Next = (error?: unknown) => void;
type ApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  principal: AuthPrincipal | null,
) => void | Promise<void>;
type AuthHandler = ReturnType<typeof createAuthHandler>;

export interface LocalApiHandlers {
  answer: ApiHandler;
  books: ApiHandler;
  documents: ApiHandler;
  feedback: ApiHandler;
  qualityMetrics: ApiHandler;
  questionLogs: ApiHandler;
  reviews: ApiHandler;
  version: ApiHandler;
}

export function createLocalApiPlugin(
  config: LocalRuntimeConfig,
  authConfig: AuthConfig,
): Plugin {
  return {
    name: 'local-answer-api',
    async configureServer(server) {
      const runtime = createRuntime(config);
      const logError: ErrorLogger = (requestId, error) => {
        const loggedError = error instanceof Error ? error : new Error(String(error));
        server.config.logger.error(
          `Local API request failed (${requestId}): ${loggedError.name}`,
        );
      };
      const auth = await createLocalAuthRuntime(authConfig, logError);
      const security = createRuntimeAdminSecurity(auth.service, auth.cookie, auth.origin);
      const handler = createLocalApiRequestHandler({
        answer: createAnswerHandler(runtime.answerRequestService, logError),
        books: createBooksHandler(runtime.bookService, logError, runtime.bookDocuments),
        documents: createDocumentsHandler(runtime.bookDocuments, logError),
        feedback: createFeedbackHandler(runtime.feedbackService, logError),
        qualityMetrics: createQualityMetricsHandler(runtime.qualityMetricsService, logError),
        questionLogs: createQuestionLogHandler(runtime.questionLogRepository, logError),
        reviews: createReviewsHandler(runtime.reviewService, logError),
        version: handleApiVersionRequest,
      }, security, logError, auth.handler);

      server.httpServer?.once('close', () => auth.repository.close());

      server.middlewares.use((request, response, next) => {
        void handler(request, response, next).catch(next);
      });
    },
  };
}

export function createLocalApiRequestHandler(
  handlers: LocalApiHandlers,
  security: AdminApiSecurity,
  logError: ErrorLogger,
  authHandler?: AuthHandler,
) {
  return async (request: IncomingMessage, response: ServerResponse, next: Next): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (authHandler && await authHandler(request, response, url.pathname)) return;
    const guard = await guardAdminRequest(request, response, url, security, logError);
    if (!guard.allowed) return;

    const handler = selectHandler(url.pathname, handlers);
    if (!handler) {
      next();
      return;
    }
    await handler(request, response, url, guard.principal);
  };
}

function selectHandler(pathname: string, handlers: LocalApiHandlers): ApiHandler | undefined {
  if (pathname === '/api/meta/version') return handlers.version;
  if (pathname === '/api/answer-question') return handlers.answer;
  if (pathname === '/api/feedback' || pathname.startsWith('/api/internal/feedback')) {
    return handlers.feedback;
  }
  if (pathname.startsWith('/api/internal/books')) return handlers.books;
  if (pathname.startsWith('/api/internal/question-logs')) return handlers.questionLogs;
  if (pathname.startsWith('/api/internal/quality-metrics')) return handlers.qualityMetrics;
  if (pathname.startsWith('/api/internal/reviews')) return handlers.reviews;
  if (pathname === '/api/knowledge/documents'
    || pathname.startsWith('/api/knowledge/documents/')) return handlers.documents;
  return undefined;
}
