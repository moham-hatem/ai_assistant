import { editionStatuses } from '../../../../../shared/contracts/books.ts';
import type { Book, BookEdition, BookPage, EditionPage, EditionStatus } from '../types';

const sha256Pattern = /^[0-9a-f]{64}$/iu;

export class BooksApiError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, status: number | null = null, code = 'INVALID_RESPONSE') {
    super(message);
    this.name = 'BooksApiError';
    this.code = code;
    this.status = status;
  }
}

export function parseBookPage(value: unknown): BookPage {
  const payload = asObject(value, 'book list');
  if (!Array.isArray(payload.items)) invalid('items');
  return parsePage(payload, payload.items.map(parseBook));
}

export function parseBookDetail(value: unknown): Book {
  return parseBook(asObject(value, 'book detail').book);
}

export function parseEditionPage(value: unknown): EditionPage {
  const payload = asObject(value, 'edition list');
  if (!Array.isArray(payload.items)) invalid('items');
  return parsePage(payload, payload.items.map(parseEdition));
}

export function parseEditionDetail(value: unknown): BookEdition {
  return parseEdition(asObject(value, 'edition detail').edition);
}

export function parseBook(value: unknown): Book {
  const item = asObject(value, 'book');
  return {
    authorOrOrganization: readNullableString(item.authorOrOrganization, 'authorOrOrganization'),
    createdAt: readDate(item.createdAt, 'createdAt'),
    id: readRequiredString(item.id, 'id'),
    language: readRequiredString(item.language, 'language'),
    subject: readNullableString(item.subject, 'subject'),
    title: readRequiredString(item.title, 'title'),
    updatedAt: readDate(item.updatedAt, 'updatedAt'),
  };
}

export function parseEdition(value: unknown): BookEdition {
  const item = asObject(value, 'edition');
  const contentHash = readRequiredString(item.contentHash, 'contentHash');
  if (!sha256Pattern.test(contentHash)) invalid('contentHash');
  return {
    archivedAt: readNullableDate(item.archivedAt, 'archivedAt'),
    bookId: readRequiredString(item.bookId, 'bookId'),
    contentHash: contentHash.toLowerCase(),
    createdAt: readDate(item.createdAt, 'createdAt'),
    id: readRequiredString(item.id, 'id'),
    originalDocumentReference: readRequiredString(
      item.originalDocumentReference,
      'originalDocumentReference',
    ),
    publishedAt: readNullableDate(item.publishedAt, 'publishedAt'),
    status: readStatus(item.status),
    version: readRequiredString(item.version, 'version'),
  };
}

function parsePage<T>(payload: Record<string, unknown>, items: T[]): PageShape<T> {
  const limit = readInteger(payload.limit, 'limit');
  const offset = readInteger(payload.offset, 'offset');
  const total = readInteger(payload.total, 'total');
  if (items.length > limit || items.length > total) {
    invalid('pagination');
  }
  return { items, limit, offset, total };
}

interface PageShape<T> { items: T[]; limit: number; offset: number; total: number }

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) invalid(field);
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== 'string') invalid(field);
  return value as string | null;
}

function readInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

function readDate(value: unknown, field: string): string {
  const date = readRequiredString(value, field);
  if (Number.isNaN(Date.parse(date))) invalid(field);
  return date;
}

function readNullableDate(value: unknown, field: string): string | null {
  return value === null ? null : readDate(value, field);
}

function readStatus(value: unknown): EditionStatus {
  if (typeof value !== 'string' || !editionStatuses.includes(value as EditionStatus)) {
    invalid('status');
  }
  return value as EditionStatus;
}

function invalid(field: string): never {
  throw new BooksApiError(`Books API returned an invalid ${field}.`);
}
