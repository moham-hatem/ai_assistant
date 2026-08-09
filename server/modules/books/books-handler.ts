import type { IncomingMessage, ServerResponse } from 'node:http';
import { editionStatuses, type EditionStatus, type PageQuery } from '../../../shared/contracts/books.ts';
import type { DocumentProcessingState } from '../../../shared/contracts/document-processing.ts';
import { AppError } from '../../errors.ts';
import { sendError, type ErrorLogger } from '../../http/error-response.ts';
import { readJson, sendJson } from '../../http/json.ts';
import type { BookService } from './book-service.ts';

interface EditionTransitioner {
  transitionEdition(
    bookId: string,
    editionId: string,
    targetStatus: EditionStatus,
  ): Promise<unknown>;
  editionProcessing?(bookId: string, editionId: string): Promise<DocumentProcessingState>;
  reprocessEdition?(bookId: string, editionId: string): Promise<DocumentProcessingState>;
  approveEditionProcessing?(
    bookId: string,
    editionId: string,
    actorId: string,
  ): Promise<{ edition: unknown; processing: DocumentProcessingState }>;
}

const defaultLimit = 25;
const maximumLimit = 100;
const maximumOffset = 1_000_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[0-9a-f]{64}$/iu;

export function createBooksHandler(
  service: BookService,
  logError: ErrorLogger,
  transitions: EditionTransitioner = service,
) {
  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const requestId = crypto.randomUUID();
    try {
      if (url.pathname === '/api/internal/books') {
        if (request.method === 'POST') {
          const book = await service.createBook(parseCreateBook(await readJson(request)));
          sendJson(response, 201, { book, requestId });
          return;
        }
        if (request.method === 'GET') {
          sendJson(response, 200, { ...(await service.listBooks(parsePage(url))), requestId });
          return;
        }
        methodNotAllowed(response, requestId);
        return;
      }

      const detail = matchPath(url.pathname, /^\/api\/internal\/books\/([^/]+)$/u);
      if (detail) {
        if (request.method !== 'GET') return methodNotAllowed(response, requestId);
        sendJson(response, 200, { book: await service.getBook(validId(detail[0])), requestId });
        return;
      }

      const editions = matchPath(url.pathname, /^\/api\/internal\/books\/([^/]+)\/editions$/u);
      if (editions) {
        const bookId = validId(editions[0]);
        if (request.method === 'POST') {
          const input = parseAddEdition(await readJson(request));
          const edition = await service.addEdition({ bookId, ...input });
          sendJson(response, 201, { edition, requestId });
          return;
        }
        if (request.method === 'GET') {
          sendJson(response, 200, {
            ...(await service.listEditions(bookId, parsePage(url))),
            requestId,
          });
          return;
        }
        methodNotAllowed(response, requestId);
        return;
      }

      const transition = matchPath(
        url.pathname,
        /^\/api\/internal\/books\/([^/]+)\/editions\/([^/]+)\/transition$/u,
      );
      if (transition) {
        if (request.method !== 'POST') return methodNotAllowed(response, requestId);
        const status = parseTransition(await readJson(request));
        const edition = await transitions.transitionEdition(
          validId(transition[0]),
          validId(transition[1]),
          status,
        );
        sendJson(response, 200, { edition, requestId });
        return;
      }

      const processing = matchPath(
        url.pathname,
        /^\/api\/internal\/books\/([^/]+)\/editions\/([^/]+)\/processing$/u,
      );

      const approval = matchPath(
        url.pathname,
        /^\/api\/internal\/books\/([^/]+)\/editions\/([^/]+)\/processing\/approve$/u,
      );
      if (approval) {
        if (request.method !== 'POST') return methodNotAllowed(response, requestId);
        if (!transitions.approveEditionProcessing) throw processingUnavailable();
        const actorId = validId(requiredString(
          objectBody(await readJson(request)).actorId,
          'actorId',
          36,
        ));
        const bookId = validId(approval[0]);
        const editionId = validId(approval[1]);
        sendJson(response, 200, {
          bookId,
          editionId,
          ...(await transitions.approveEditionProcessing(bookId, editionId, actorId)),
          requestId,
        });
        return;
      }

      if (processing) {
        const bookId = validId(processing[0]);
        const editionId = validId(processing[1]);
        if (request.method === 'GET') {
          if (!transitions.editionProcessing) throw processingUnavailable();
          sendJson(response, 200, {
            bookId,
            editionId,
            processing: await transitions.editionProcessing(bookId, editionId),
            requestId,
          });
          return;
        }
        if (request.method === 'POST') {
          if (!transitions.reprocessEdition) throw processingUnavailable();
          sendJson(response, 200, {
            bookId,
            editionId,
            processing: await transitions.reprocessEdition(bookId, editionId),
            requestId,
          });
          return;
        }
        methodNotAllowed(response, requestId);
        return;
      }

      throw new AppError('ROUTE_NOT_FOUND', 'Internal book route not found.', 404);
    } catch (error) {
      sendError(response, requestId, error, logError);
    }
  };
}

function parseCreateBook(value: unknown) {
  const body = objectBody(value);
  return {
    authorOrOrganization: optionalString(body.authorOrOrganization, 'authorOrOrganization', 300),
    language: requiredString(body.language, 'language', 64),
    subject: optionalString(body.subject, 'subject', 200),
    title: requiredString(body.title, 'title', 500),
  };
}

function parseAddEdition(value: unknown) {
  const body = objectBody(value);
  const contentHash = requiredString(body.contentHash, 'contentHash', 64);
  if (!sha256Pattern.test(contentHash)) invalid('contentHash must be a 64-character SHA-256 hex value.');
  const versionValue = body.version;
  const version = typeof versionValue === 'number' && Number.isFinite(versionValue)
    ? String(versionValue)
    : requiredString(versionValue, 'version', 100);
  return {
    contentHash: contentHash.toLowerCase(),
    originalDocumentReference: requiredString(
      body.originalDocumentReference,
      'originalDocumentReference',
      2_048,
    ),
    version,
  };
}

function parseTransition(value: unknown): EditionStatus {
  const status = objectBody(value).status;
  if (typeof status !== 'string' || !editionStatuses.includes(status as EditionStatus)) {
    invalid('status is not a recognized edition status.');
  }
  return status as EditionStatus;
}

function parsePage(url: URL): PageQuery {
  return {
    limit: parseInteger(url.searchParams.get('limit'), defaultLimit, maximumLimit, 1),
    offset: parseInteger(url.searchParams.get('offset'), 0, maximumOffset),
  };
}

function parseInteger(value: string | null, fallback: number, maximum: number, minimum = 0): number {
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value)) invalid('Pagination values must be integers.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    invalid('Pagination value is outside the supported range.');
  }
  return parsed;
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('A JSON object is required.');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') invalid(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) invalid(`${field} has an invalid length.`);
  return normalized;
}

function optionalString(value: unknown, field: string, maximum: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, field, maximum);
}

function validId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return invalid('Resource id is invalid.');
  }
  if (!uuidPattern.test(decoded)) invalid('Resource id is invalid.');
  return decoded;
}

function matchPath(path: string, pattern: RegExp): string[] | undefined {
  const match = path.match(pattern);
  return match ? match.slice(1) : undefined;
}

function methodNotAllowed(response: ServerResponse, requestId: string): void {
  sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
}

function invalid(message: string): never {
  throw new AppError('INVALID_REQUEST', message, 400);
}

function processingUnavailable(): AppError {
  return new AppError(
    'DOCUMENT_PROCESSOR_UNAVAILABLE',
    'Document processing operations are unavailable.',
    503,
  );
}
