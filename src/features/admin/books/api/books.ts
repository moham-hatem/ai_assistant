import type { Book, BookEdition, BookPage, EditionPage, EditionStatus } from '../types';
import {
  BooksApiError,
  parseBookDetail,
  parseBookPage,
  parseEditionDetail,
  parseEditionPage,
} from './book-parser.ts';

export { BooksApiError } from './book-parser.ts';

export async function fetchBooks(
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<BookPage> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return parseBookPage(await request(`/api/internal/books?${query}`, { signal }));
}

export async function fetchBook(id: string, signal?: AbortSignal): Promise<Book> {
  return parseBookDetail(await request(`/api/internal/books/${encodeURIComponent(id)}`, { signal }));
}

export async function fetchEditions(
  bookId: string,
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<EditionPage> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const path = `/api/internal/books/${encodeURIComponent(bookId)}/editions?${query}`;
  return parseEditionPage(await request(path, { signal }));
}

export async function transitionEdition(
  bookId: string,
  editionId: string,
  status: EditionStatus,
): Promise<BookEdition> {
  const path = `/api/internal/books/${encodeURIComponent(bookId)}`
    + `/editions/${encodeURIComponent(editionId)}/transition`;
  return parseEditionDetail(await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }));
}

async function request(url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new BooksApiError('Books API could not be reached.', null, 'NETWORK_ERROR');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BooksApiError('Books API returned invalid JSON.', response.status);
  }
  if (!response.ok) {
    const code = readErrorCode(payload);
    throw new BooksApiError(code, response.status, code);
  }
  return payload;
}

function readErrorCode(value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const code = (value as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return 'REQUEST_FAILED';
}
