import type { Plugin } from 'vite';
import type { LocalRuntimeConfig } from '../config.ts';
import { createRuntime } from '../create-runtime.ts';
import { createAnswerHandler } from '../http/answer-handler.ts';
import { createDocumentsHandler } from '../http/documents-handler.ts';
import { createQuestionLogHandler } from '../modules/question-log/question-log-handler.ts';
import { createBooksHandler } from '../modules/books/books-handler.ts';

export function localAnswerApi(config: LocalRuntimeConfig): Plugin {
  return {
    name: 'local-answer-api',
    configureServer(server) {
      const runtime = createRuntime(config);
      const logError = (requestId: string, error: unknown) => {
        const loggedError = error instanceof Error ? error : new Error(String(error));
        server.config.logger.error(
          `Local answer API failed (${requestId}): ${loggedError.stack ?? loggedError.message}`,
        );
      };
      const answer = createAnswerHandler(runtime.answerService, runtime.questionLogService, logError);
      const books = createBooksHandler(runtime.bookService, logError, runtime.bookDocuments);
      const documents = createDocumentsHandler(runtime.bookDocuments, logError);
      const questionLogs = createQuestionLogHandler(runtime.questionLogRepository, logError);

      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === '/api/answer-question') void answer(request, response);
        else if (url.pathname.startsWith('/api/internal/books')) {
          void books(request, response, url);
        }
        else if (url.pathname.startsWith('/api/internal/question-logs')) {
          void questionLogs(request, response, url);
        }
        else if (url.pathname.startsWith('/api/knowledge/documents')) {
          void documents(request, response, url);
        } else next();
      });
    },
  };
}
