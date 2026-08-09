import type { DocumentProcessingState } from '../../../../../shared/contracts/document-processing.ts';
import { BooksApiError } from './book-parser.ts';
import { parseEditionProcessingResponse } from './book-processing-parser.ts';

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
  signal?: AbortSignal,
): Promise<DocumentProcessingState> {
  return processingRequest(bookId, editionId, '/approve', 'POST', signal);
}

async function processingRequest(
  bookId: string,
  editionId: string,
  suffix: string,
  method: 'GET' | 'POST',
  signal?: AbortSignal,
): Promise<DocumentProcessingState> {
  const path = `/api/internal/books/${encodeURIComponent(bookId)}`
    + `/editions/${encodeURIComponent(editionId)}/processing${suffix}`;
  let response: Response;
  try {
    response = await fetch(path, { method, signal });
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
  return parseEditionProcessingResponse(payload, bookId, editionId);
}

function readErrorCode(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const code = (value as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return 'REQUEST_FAILED';
}
