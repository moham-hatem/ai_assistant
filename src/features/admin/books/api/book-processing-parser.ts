import {
  parseDocumentProcessingSummary,
  type DocumentProcessingState,
} from '../../../../../shared/contracts/document-processing.ts';
import { BooksApiError } from './book-parser.ts';

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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function invalid(): never {
  throw new BooksApiError('Books API returned invalid document processing data.');
}
