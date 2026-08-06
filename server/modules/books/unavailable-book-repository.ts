import type { Book, BookEdition, Page, PageQuery } from '../../../shared/contracts/books.ts';
import {
  BookRepositoryUnavailableError,
  type BookRepository,
  type EditionTransitionCommand,
} from './book-repository.ts';

export class UnavailableBookRepository implements BookRepository {
  private readonly reason: unknown;

  constructor(reason: unknown) {
    this.reason = reason;
  }

  async addEdition(_edition: BookEdition): Promise<void> { this.fail(); }
  async createBook(_book: Book): Promise<void> { this.fail(); }
  async getBook(_id: string): Promise<Book | undefined> { return this.fail(); }
  async getEdition(_bookId: string, _editionId: string): Promise<BookEdition | undefined> {
    return this.fail();
  }
  async listBooks(_query: PageQuery): Promise<Page<Book>> { return this.fail(); }
  async listEditions(_bookId: string, _query: PageQuery): Promise<Page<BookEdition>> {
    return this.fail();
  }
  async publishEdition(_command: EditionTransitionCommand): Promise<BookEdition> {
    return this.fail();
  }
  async transitionEdition(_command: EditionTransitionCommand): Promise<BookEdition> {
    return this.fail();
  }

  private fail(): never {
    throw new BookRepositoryUnavailableError({ cause: this.reason });
  }
}
