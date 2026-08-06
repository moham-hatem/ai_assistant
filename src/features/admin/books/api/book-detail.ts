import type { Book, EditionPage } from '../types';
import { fetchBook, fetchEditions } from './books.ts';

export interface BookDetailPage {
  book: Book;
  editions: EditionPage;
}

export async function fetchBookDetailPage(
  bookId: string,
  editionLimit: number,
  editionOffset: number,
  signal?: AbortSignal,
): Promise<BookDetailPage> {
  const [book, editions] = await Promise.all([
    fetchBook(bookId, signal),
    fetchEditions(bookId, editionLimit, editionOffset, signal),
  ]);
  return { book, editions };
}
