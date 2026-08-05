import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DocumentStore } from '../documents/document-store.ts';
import { AppError } from '../errors.ts';
import { readBinary } from './binary.ts';
import { sendError, type ErrorLogger } from './error-response.ts';
import { sendFile } from './send-file.ts';
import { sendJson } from './json.ts';

export function createDocumentsHandler(store: DocumentStore, logError: ErrorLogger) {
  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const requestId = crypto.randomUUID();

    try {
      if (request.method === 'GET' && url.pathname === '/api/knowledge/documents') {
        sendJson(response, 200, { documents: await store.list(), requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/documents') {
        const name = url.searchParams.get('name')?.trim();
        if (!name) throw new AppError('INVALID_REQUEST', 'اسم الملف مطلوب.', 400);
        const document = await store.import({ name, buffer: await readBinary(request) });
        sendJson(response, 201, { document, requestId });
        return;
      }

      const resource = url.pathname.match(
        /^\/api\/knowledge\/documents\/([^/]+)\/(source|text)$/,
      );
      if (request.method === 'GET' && resource) {
        const kind = resource[2] as 'source' | 'text';
        const stored = await store.resource(resource[1], kind);
        await sendFile(request, response, {
          contentType: kind === 'source' ? contentType(stored.metadata.format) : 'text/plain; charset=utf-8',
          name: kind === 'source' ? stored.metadata.name : `${stored.metadata.name}.txt`,
          path: stored.path,
        });
        return;
      }

      const id = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)$/)?.[1];
      if (request.method === 'DELETE' && id) {
        await store.remove(id);
        sendJson(response, 200, { deleted: true, requestId });
        return;
      }

      sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function contentType(format: 'docx' | 'markdown' | 'pdf' | 'text') {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'text/plain; charset=utf-8';
}
