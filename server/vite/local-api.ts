import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
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
import type { SecurityAuditConfigResolution } from '../modules/security-audit/config.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { createSecurityAuditHandler } from '../modules/security-audit/security-audit-handler.ts';
import type { SecurityAuditRepository } from '../modules/security-audit/repository.ts';
import { UnavailableSecurityAuditRepository } from '../modules/security-audit/unavailable-repository.ts';
import { LocalBackupService, createBackupsHandler } from '../modules/backups/index.ts';
import { createLocalSystemDiagnosticsService } from '../modules/system-diagnostics/factory.ts';
import { createSystemDiagnosticsHandler } from '../modules/system-diagnostics/system-diagnostics-handler.ts';
import { resolve } from 'node:path';

type Next = (error?: unknown) => void;
type ApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  principal: AuthPrincipal | null,
  requestId: string,
) => void | Promise<void>;
type AuthHandler = ReturnType<typeof createAuthHandler>;

export interface LocalApiHandlers {
  access: ApiHandler;
  answer: ApiHandler;
  backups?: ApiHandler;
  books: ApiHandler;
  documents: ApiHandler;
  feedback: ApiHandler;
  qualityMetrics: ApiHandler;
  questionLogs: ApiHandler;
  reviews: ApiHandler;
  securityAudit?: ApiHandler;
  systemDiagnostics?: ApiHandler;
  version: ApiHandler;
}

export function createLocalApiPlugin(
  config: LocalRuntimeConfig,
  authConfig: AuthConfig,
  auditConfig: SecurityAuditConfigResolution,
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
      let auditRepository: SecurityAuditRepository;
      if (auditConfig.config) {
        try {
          const candidate = new SqliteSecurityAuditRepository(
            auditConfig.config.databasePath,
            auditConfig.config.keys,
            auditConfig.config.currentKeyVersion,
          );
          try {
            const integrity = await candidate.verifyIntegrity(new Date().toISOString());
            if (integrity.status !== 'valid') {
              throw new Error('Security audit integrity verification did not pass.');
            }
            auditRepository = candidate;
          } catch (error) {
            candidate.close();
            throw error;
          }
        } catch (error) {
          server.config.logger.warn(
            'Security audit storage is unavailable. Public answer/version APIs remain available; sensitive operations return 503.',
          );
          auditRepository = new UnavailableSecurityAuditRepository(error);
        }
      } else {
        server.config.logger.warn(auditConfig.setupError);
        auditRepository = new UnavailableSecurityAuditRepository(new Error('Audit setup incomplete.'));
      }
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
      const dataDirectory = resolve(process.cwd(), 'data');
      const backupService = new LocalBackupService({
        appVersion: config.appVersion,
        backupDirectory: config.backupDirectory,
        dataDirectory,
        directoryScopes: [config.documentDirectory, config.knowledgeDirectory],
        sqliteFiles: [
          config.booksDatabaseFile,
          config.questionLogDatabaseFile,
          authConfig.databasePath,
          ...(auditConfig.config ? [auditConfig.config.databasePath] : []),
        ],
      });
      const diagnostics = createLocalSystemDiagnosticsService(config, {
        appVersion: config.appVersion,
        auditConfigured: Boolean(auditConfig.config),
        verifyAuditIntegrity: () => audit.verifyIntegrity(),
      });
      const handler = createLocalApiRequestHandler({
        access: auth.accessHandler,
        answer: createAnswerHandler(runtime.answerRequestService, logError),
        backups: createBackupsHandler(backupService, logError),
        books: createBooksHandler(runtime.bookService, logError, runtime.bookDocuments),
        documents: createDocumentsHandler(runtime.bookDocuments, logError),
        feedback: createFeedbackHandler(runtime.feedbackService, logError),
        qualityMetrics: createQualityMetricsHandler(runtime.qualityMetricsService, logError),
        questionLogs: createQuestionLogHandler(runtime.questionLogRepository, logError),
        reviews: createReviewsHandler(runtime.reviewService, logError),
        securityAudit: createSecurityAuditHandler(audit, logError),
        systemDiagnostics: createSystemDiagnosticsHandler(diagnostics, logError),
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
    const requestId = randomUUID();
    const guard = await guardAdminRequest(
      request, response, url, security, logError, requestId,
    );
    if (!guard.allowed) return;

    const handler = selectHandler(url.pathname, handlers);
    if (!handler) {
      next();
      return;
    }
    await handler(request, response, url, guard.principal, requestId);
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
  if (pathname === '/api/internal/system-diagnostics') return handlers.systemDiagnostics;
  if (pathname === '/api/internal/backups' || pathname.startsWith('/api/internal/backups/')) {
    return handlers.backups;
  }
  if (pathname === '/api/knowledge/documents'
    || pathname.startsWith('/api/knowledge/documents/')) return handlers.documents;
  return undefined;
}
