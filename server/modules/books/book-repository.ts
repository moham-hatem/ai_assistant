import type {
  Book,
  BookEdition,
  EditionStatus,
  Page,
  PageQuery,
} from '../../../shared/contracts/books.ts';

export interface EditionTransitionCommand {
  at: string;
  bookId: string;
  editionId: string;
  expectedStatus: EditionStatus;
  targetStatus: EditionStatus;
}

export interface BookRepository {
  addEdition(edition: BookEdition): Promise<void>;
  createBook(book: Book): Promise<void>;
  getBook(id: string): Promise<Book | undefined>;
  getEdition(bookId: string, editionId: string): Promise<BookEdition | undefined>;
  getEditionByDocumentReference(reference: string): Promise<BookEdition | undefined>;
  listBooks(query: PageQuery): Promise<Page<Book>>;
  listDocumentEditions(): Promise<BookEdition[]>;
  listEditions(bookId: string, query: PageQuery): Promise<Page<BookEdition>>;
  publishEdition(command: EditionTransitionCommand): Promise<BookEdition>;
  transitionEdition(command: EditionTransitionCommand): Promise<BookEdition>;
}

export class DuplicateEditionError extends Error {
  constructor() {
    super('An edition with this content hash already exists for the book.');
    this.name = 'DuplicateEditionError';
  }
}

export class ConcurrentEditionUpdateError extends Error {
  constructor() {
    super('The edition status changed before the operation completed.');
    this.name = 'ConcurrentEditionUpdateError';
  }
}

export class BookRepositoryUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The local book repository is unavailable.', options);
    this.name = 'BookRepositoryUnavailableError';
  }
}
