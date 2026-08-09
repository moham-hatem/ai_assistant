import type {
  BookDocumentMetadata,
  BookEditionUploadResult,
} from '../types';
import { parseDocumentProcessingSummary } from '../../../../../shared/contracts/document-processing.ts';
import { BooksApiError, parseBook, parseEdition } from './book-parser.ts';

const documentFormats = ['docx', 'markdown', 'pdf', 'text'] as const;

export function parseBookEditionUpload(
  value: unknown,
  expectedBookId: string,
  expectedVersion: string,
): BookEditionUploadResult {
  const payload = asObject(value, 'edition upload');
  const book = parseBook(payload.book);
  const edition = parseEdition(payload.edition);
  const document = parseDocument(payload.document);

  if (book.id !== expectedBookId
    || edition.bookId !== book.id
    || edition.version !== expectedVersion
    || edition.status !== 'ready'
    || edition.originalDocumentReference !== `document:${document.id}`) {
    invalid('edition upload relationship');
  }
  return { book, document, edition };
}

function parseDocument(value: unknown): BookDocumentMetadata {
  const item = asObject(value, 'document');
  const format = readString(item.format, 'document format');
  if (!documentFormats.includes(format as BookDocumentMetadata['format'])) {
    invalid('document format');
  }
  let processing: BookDocumentMetadata['processing'];
  try {
    processing = parseDocumentProcessingSummary(item.processing);
  } catch {
    invalid('document processing');
  }
  return {
    characterCount: readInteger(item.characterCount, 'document characterCount'),
    format: format as BookDocumentMetadata['format'],
    id: readString(item.id, 'document id'),
    importedAt: readDate(item.importedAt, 'document importedAt'),
    name: readString(item.name, 'document name'),
    processing,
    size: readInteger(item.size, 'document size'),
  };
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) invalid(field);
  return value;
}

function readInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

function readDate(value: unknown, field: string): string {
  const date = readString(value, field);
  if (Number.isNaN(Date.parse(date))) invalid(field);
  return date;
}

function invalid(field: string): never {
  throw new BooksApiError(`Books API returned an invalid ${field}.`);
}
