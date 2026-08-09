import { randomUUID } from 'node:crypto';
import type {
  Book,
  BookEdition,
  EditionStatus,
  Page,
  PageQuery,
} from '../../../shared/contracts/books.ts';
import { AppError } from '../../errors.ts';
import { assertEditionTransition, InvalidEditionTransitionError } from './book-edition.ts';
import {
  BookRepositoryUnavailableError,
  ConcurrentEditionUpdateError,
  DuplicateEditionError,
  type BookRepository,
} from './book-repository.ts';

export interface CreateBookInput {
  authorOrOrganization?: string;
  language: string;
  subject?: string;
  title: string;
}

export interface AddEditionInput {
  bookId: string;
  contentHash: string;
  originalDocumentReference: string;
  version: string;
}

export class BookService {
  private readonly repository: BookRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: BookRepository,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
  }

  async createBook(input: CreateBookInput): Promise<Book> {
    const now = this.now().toISOString();
    const book: Book = {
      authorOrOrganization: input.authorOrOrganization ?? null,
      createdAt: now,
      id: this.createId(),
      language: input.language,
      subject: input.subject ?? null,
      title: input.title,
      updatedAt: now,
    };
    await this.call(() => this.repository.createBook(book));
    return book;
  }

  async listBooks(query: PageQuery): Promise<Page<Book>> {
    return this.call(() => this.repository.listBooks(query));
  }

  async getBook(id: string): Promise<Book> {
    const book = await this.call(() => this.repository.getBook(id));
    if (!book) throw new AppError('BOOK_NOT_FOUND', 'Book not found.', 404);
    return book;
  }

  async addEdition(input: AddEditionInput): Promise<BookEdition> {
    await this.getBook(input.bookId);
    const edition: BookEdition = {
      archivedAt: null,
      bookId: input.bookId,
      contentHash: input.contentHash.toLowerCase(),
      createdAt: this.now().toISOString(),
      id: this.createId(),
      originalDocumentReference: input.originalDocumentReference,
      publishedAt: null,
      status: 'draft',
      version: input.version,
    };
    await this.call(() => this.repository.addEdition(edition));
    return edition;
  }

  async listEditions(bookId: string, query: PageQuery): Promise<Page<BookEdition>> {
    await this.getBook(bookId);
    return this.call(() => this.repository.listEditions(bookId, query));
  }

  async getEdition(bookId: string, editionId: string): Promise<BookEdition> {
    await this.getBook(bookId);
    const edition = await this.call(() => this.repository.getEdition(bookId, editionId));
    if (!edition) throw new AppError('EDITION_NOT_FOUND', 'Edition not found.', 404);
    return edition;
  }

  async transitionEdition(
    bookId: string,
    editionId: string,
    targetStatus: EditionStatus,
  ): Promise<BookEdition> {
    const edition = await this.getEdition(bookId, editionId);

    try {
      assertEditionTransition(edition.status, targetStatus);
    } catch (error) {
      if (error instanceof InvalidEditionTransitionError) {
        throw new AppError('INVALID_EDITION_TRANSITION', error.message, 409, { cause: error });
      }
      throw error;
    }

    const command = {
      at: this.now().toISOString(),
      bookId,
      editionId,
      expectedStatus: edition.status,
      targetStatus,
    };
    return this.call(() => targetStatus === 'published'
      ? this.repository.publishEdition(command)
      : this.repository.transitionEdition(command));
  }

  async reopenEditionProcessing(bookId: string, editionId: string): Promise<BookEdition> {
    const edition = await this.getEdition(bookId, editionId);
    if (edition.status !== 'ready') {
      throw new AppError(
        'EDITION_REPROCESS_FORBIDDEN',
        'Only a ready edition can enter system-owned reprocessing.',
        409,
      );
    }
    return this.call(() => this.repository.transitionEdition({
      at: this.now().toISOString(),
      bookId,
      editionId,
      expectedStatus: 'ready',
      targetStatus: 'processing',
    }));
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DuplicateEditionError) {
        throw new AppError('DUPLICATE_EDITION', error.message, 409, { cause: error });
      }
      if (error instanceof ConcurrentEditionUpdateError) {
        throw new AppError('EDITION_CONFLICT', error.message, 409, { cause: error });
      }
      if (error instanceof BookRepositoryUnavailableError) {
        throw new AppError('BOOKS_UNAVAILABLE', error.message, 503, { cause: error });
      }
      throw error;
    }
  }
}
