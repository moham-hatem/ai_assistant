import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DocumentMetadata, DocumentResource, DocumentResourceKind } from '../documents/types.ts';
import { AppError } from '../errors.ts';
import type {
  UploadBookDocumentInput,
  UploadBookDocumentResult,
} from '../modules/books/book-document-service.ts';
import { readBinary } from './binary.ts';
import { sendError, type ErrorLogger } from './error-response.ts';
import { sendFile } from './send-file.ts';
import { sendJson } from './json.ts';
import type { AuthPrincipal } from '../../shared/contracts/auth.ts';
import type { SecurityAuditContext } from '../modules/security-audit/domain.ts';

interface DocumentApplication {
  documentResource(id: string, kind: DocumentResourceKind): Promise<DocumentResource>;
  listDocuments(): Promise<DocumentMetadata[]>;
  removeDocument(id: string): Promise<void>;
  upload(input: UploadBookDocumentInput, auditContext?: SecurityAuditContext): Promise<UploadBookDocumentResult>;
}

export function createDocumentsHandler(application: DocumentApplication, logError: ErrorLogger) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    principal: AuthPrincipal | null = null,
  ) => {
    const requestId = crypto.randomUUID();

    try {
      if (request.method === 'GET' && url.pathname === '/api/knowledge/documents') {
        sendJson(response, 200, { documents: await application.listDocuments(), requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/documents') {
        const name = url.searchParams.get('name')?.trim();
        if (!name) throw new AppError('INVALID_REQUEST', 'اسم الملف مطلوب.', 400);
        const bookId = optionalQuery(url, 'bookId', 100);
        const version = optionalQuery(url, 'version', 100);
        const result = await application.upload({
          bookId,
          buffer: await readBinary(request),
          name,
          version,
        }, principal ? { actorUserId: principal.id, requestId } : undefined);
        sendJson(response, 201, bookId
          ? { ...result, requestId }
          : { document: result.document, requestId });
        return;
      }

      const resource = url.pathname.match(
        /^\/api\/knowledge\/documents\/([^/]+)\/(source|text)$/,
      );
      if (request.method === 'GET' && resource) {
        const kind = resource[2] as 'source' | 'text';
        const stored = await application.documentResource(resource[1], kind);
        await sendFile(request, response, {
          contentType: kind === 'source' ? contentType(stored.metadata.format) : 'text/plain; charset=utf-8',
          name: kind === 'source' ? stored.metadata.name : `${stored.metadata.name}.txt`,
          path: stored.path,
        });
        return;
      }

      const id = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)$/)?.[1];
      if (request.method === 'DELETE' && id) {
        await application.removeDocument(id);
        sendJson(response, 200, { deleted: true, requestId });
        return;
      }

      sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function optionalQuery(url: URL, name: string, maximum: number): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  if (!value) return undefined;
  if (value.length > maximum) throw new AppError('INVALID_REQUEST', `${name} is too long.`, 400);
  return value;
}

function contentType(format: 'docx' | 'markdown' | 'pdf' | 'text') {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'text/plain; charset=utf-8';
}
