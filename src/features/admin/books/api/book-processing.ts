import type { DocumentProcessingState } from '../../../../../shared/contracts/document-processing.ts';
import { adminFetch } from '../../api/admin-fetch.ts';
import type { EditionProcessingApprovalResult } from '../types.ts';
import { localBookProcessingActorId } from '../processing-operator.ts';
import { BooksApiError } from './book-parser.ts';
import {
  parseEditionProcessingApprovalResponse,
  parseEditionProcessingResponse,
} from './book-processing-parser.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface ApprovalRequestOptions {
  actorId?: string;
  signal?: AbortSignal;
}

export function fetchEditionProcessing(
  bookId: string,
  editionId: string,
  signal?: AbortSignal,
): Promise<DocumentProcessingState> {
  return processingRequest(bookId, editionId, '', 'GET', signal);
}

export function reprocessEdition(
  bookId: string,
  editionId: string,
  signal?: AbortSignal,
): Promise<DocumentProcessingState> {
  return processingRequest(bookId, editionId, '', 'POST', signal);
}

export function approveEditionProcessing(
  bookId: string,
  editionId: string,
  options: ApprovalRequestOptions = {},
): Promise<EditionProcessingApprovalResult> {
  const actorId = options.actorId ?? localBookProcessingActorId;
  if (!uuidPattern.test(actorId)) {
    return Promise.reject(new BooksApiError('Invalid local processing actor.', null, 'INVALID_ACTOR_ID'));
  }
  const path = processingPath(bookId, editionId, '/approve');
  return request(path, {
    body: JSON.stringify({ actorId }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: options.signal,
  }).then((payload) => (
    parseEditionProcessingApprovalResponse(payload, bookId, editionId)
  ));
}

async function processingRequest(
  bookId: string,
  editionId: string,
  suffix: string,
  method: 'GET' | 'POST',
  signal?: AbortSignal,
): Promise<DocumentProcessingState> {
  const path = processingPath(bookId, editionId, suffix);
  return request(path, { method, signal }).then((payload) => (
    parseEditionProcessingResponse(payload, bookId, editionId)
  ));
}

function processingPath(bookId: string, editionId: string, suffix: string): string {
  return `/api/internal/books/${encodeURIComponent(bookId)}`
    + `/editions/${encodeURIComponent(editionId)}/processing${suffix}`;
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await adminFetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new BooksApiError('Books processing API could not be reached.', null, 'NETWORK_ERROR');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BooksApiError('Books processing API returned invalid JSON.', response.status);
  }
  if (!response.ok) {
    const code = readErrorCode(payload);
    throw new BooksApiError(code, response.status, code);
  }
  return payload;
}

function readErrorCode(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const code = (value as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return 'REQUEST_FAILED';
}
