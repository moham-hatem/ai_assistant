import type { Book, BookEdition, EditionStatus, Page } from '../../../../shared/contracts/books';

export type { Book, BookEdition, EditionStatus };
export type BookPage = Page<Book>;
export type EditionPage = Page<BookEdition>;
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PendingTransition {
  edition: BookEdition;
  targetStatus: EditionStatus;
}
