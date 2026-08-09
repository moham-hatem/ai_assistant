import type { Plugin } from 'vite';
import type { LocalRuntimeConfig } from '../config.ts';
import { createRuntime } from '../create-runtime.ts';
import { createAnswerHandler } from '../http/answer-handler.ts';
import { createDocumentsHandler } from '../http/documents-handler.ts';
import { createQuestionLogHandler } from '../modules/question-log/question-log-handler.ts';
import { createBooksHandler } from '../modules/books/books-handler.ts';
import { createReviewsHandler } from '../modules/reviews/reviews-handler.ts';
import { createFeedbackHandler } from '../modules/feedback/feedback-handler.ts';
import { createQualityMetricsHandler } from '../modules/quality-metrics/quality-metrics-handler.ts';

export function localAnswerApi(config: LocalRuntimeConfig): Plugin {
  return {
    name: 'local-answer-api',
    configureServer(server) {
      const runtime = createRuntime(config);
      const logError = (requestId: string, error: unknown) => {
        const loggedError = error instanceof Error ? error : new Error(String(error));
        server.config.logger.error(
          `Local API request failed (${requestId}): ${loggedError.name}`,
        );
      };
      const answer = createAnswerHandler(runtime.answerRequestService, logError);
      const books = createBooksHandler(runtime.bookService, logError, runtime.bookDocuments);
      const documents = createDocumentsHandler(runtime.bookDocuments, logError);
      const questionLogs = createQuestionLogHandler(runtime.questionLogRepository, logError);
      const reviews = createReviewsHandler(runtime.reviewService, logError);
      const feedback = createFeedbackHandler(runtime.feedbackService, logError);
      const qualityMetrics = createQualityMetricsHandler(runtime.qualityMetricsService, logError);

      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === '/api/answer-question') void answer(request, response);
        else if (url.pathname === '/api/feedback' || url.pathname.startsWith('/api/internal/feedback')) {
          void feedback(request, response, url);
        }
        else if (url.pathname.startsWith('/api/internal/books')) {
          void books(request, response, url);
        }
        else if (url.pathname.startsWith('/api/internal/question-logs')) {
          void questionLogs(request, response, url);
        }
        else if (url.pathname.startsWith('/api/internal/quality-metrics')) {
          void qualityMetrics(request, response, url);
        }
        else if (url.pathname.startsWith('/api/internal/reviews')) {
          void reviews(request, response, url);
        }
        else if (url.pathname.startsWith('/api/knowledge/documents')) {
          void documents(request, response, url);
        } else next();
      });
    },
  };
}
