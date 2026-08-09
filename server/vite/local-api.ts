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
import type { SecurityAuditConfig } from '../modules/security-audit/config.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { createSecurityAuditHandler } from '../modules/security-audit/security-audit-handler.ts';

type Next = (error?: unknown) => void;
type ApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  principal: AuthPrincipal | null,
) => void | Promise<void>;
type AuthHandler = ReturnType<typeof createAuthHandler>;

export interface LocalApiHandlers {
  access: ApiHandler;
  answer: ApiHandler;
  books: ApiHandler;
  documents: ApiHandler;
  feedback: ApiHandler;
  qualityMetrics: ApiHandler;
  questionLogs: ApiHandler;
  reviews: ApiHandler;
  securityAudit?: ApiHandler;
  version: ApiHandler;
}

export function createLocalApiPlugin(
  config: LocalRuntimeConfig,
  authConfig: AuthConfig,
  auditConfig: SecurityAuditConfig,
): Plugin {
  return {
    name: 'local-answer-api',
    async configureServer(server) {
      const logError: ErrorLogger = (requestId, error) => {
        const loggedError = error instanceof Error ? error : new Error(String(error));
        server.config.logger.error(
          `Local API request failed (${requestId}): ${loggedError.name}`,
        );
      };
      const auditRepository = new SqliteSecurityAuditRepository(
        auditConfig.databasePath,
        auditConfig.keys,
        auditConfig.currentKeyVersion,
      );
      const audit = new SecurityAuditService(auditRepository, undefined, undefined, (error) => {
        logError('security-audit', error);
      });
      let runtime: ReturnType<typeof createRuntime> | undefined;
      let auth: Awaited<ReturnType<typeof createLocalAuthRuntime>>;
      try {
        runtime = createRuntime(config, { securityAudit: audit });
        auth = await createLocalAuthRuntime(authConfig, logError, audit);
      } catch (error) {
        runtime?.close();
        auditRepository.close();
        throw error;
      }
      const security = createRuntimeAdminSecurity(auth.service, auth.cookie, auth.origin, audit);
      const handler = createLocalApiRequestHandler({
        access: auth.accessHandler,
        answer: createAnswerHandler(runtime.answerRequestService, logError),
        books: createBooksHandler(runtime.bookService, logError, runtime.bookDocuments),
        documents: createDocumentsHandler(runtime.bookDocuments, logError),
        feedback: createFeedbackHandler(runtime.feedbackService, logError),
        qualityMetrics: createQualityMetricsHandler(runtime.qualityMetricsService, logError),
        questionLogs: createQuestionLogHandler(runtime.questionLogRepository, logError),
        reviews: createReviewsHandler(runtime.reviewService, logError),
        securityAudit: createSecurityAuditHandler(audit, logError),
        version: handleApiVersionRequest,
      }, security, logError, auth.handler);

      server.httpServer?.once('close', () => {
        auth.repository.close();
        runtime.close();
        auditRepository.close();
      });

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
  if (pathname === '/api/auth/invitations/redeem' || pathname === '/api/auth/recovery/redeem' ||
      pathname === '/api/internal/access' || pathname.startsWith('/api/internal/access/')) {
    return handlers.access;
  }
  if (pathname === '/api/meta/version') return handlers.version;
  if (pathname === '/api/answer-question') return handlers.answer;
  if (pathname === '/api/feedback' || pathname.startsWith('/api/internal/feedback')) {
    return handlers.feedback;
  }
  if (pathname.startsWith('/api/internal/books')) return handlers.books;
  if (pathname.startsWith('/api/internal/question-logs')) return handlers.questionLogs;
  if (pathname.startsWith('/api/internal/quality-metrics')) return handlers.qualityMetrics;
  if (pathname.startsWith('/api/internal/reviews')) return handlers.reviews;
  if (pathname.startsWith('/api/internal/security-audit')) return handlers.securityAudit;
  if (pathname === '/api/knowledge/documents'
    || pathname.startsWith('/api/knowledge/documents/')) return handlers.documents;
  return undefined;
}
