import {
  parseDocumentProcessingSummary,
  type DocumentProcessingState,
} from '../../../../../shared/contracts/document-processing.ts';
import type { EditionProcessingApprovalResult } from '../types.ts';
import { BooksApiError, parseEdition } from './book-parser.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseEditionProcessingResponse(
  value: unknown,
  expectedBookId: string,
  expectedEditionId: string,
): DocumentProcessingState {
  const payload = asObject(value);
  if (payload.bookId !== expectedBookId || payload.editionId !== expectedEditionId) invalid();
  const processing = asObject(payload.processing);
  if (!Number.isSafeInteger(processing.generation) || (processing.generation as number) < 0) {
    invalid();
  }

  try {
    return {
      generation: processing.generation as number,
      summary: parseDocumentProcessingSummary(processing.summary),
    };
  } catch {
    return invalid();
  }
}

export function parseEditionProcessingApprovalResponse(
  value: unknown,
  expectedBookId: string,
  expectedEditionId: string,
): EditionProcessingApprovalResult {
  const payload = asObject(value);
  if (typeof payload.requestId !== 'string' || !uuidPattern.test(payload.requestId)) invalid();
  const processing = parseEditionProcessingResponse(payload, expectedBookId, expectedEditionId);
  const edition = parseEdition(payload.edition);
  if (edition.bookId !== expectedBookId
    || edition.id !== expectedEditionId
    || edition.status !== 'ready'
    || processing.summary.status !== 'ready') {
    invalid();
  }
  return { edition, processing };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function invalid(): never {
  throw new BooksApiError('Books API returned invalid document processing data.');
}
