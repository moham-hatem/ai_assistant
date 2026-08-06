import { createHash, randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import type { Book, BookEdition, EditionStatus } from '../../../shared/contracts/books.ts';
import type { DocumentStore } from '../../documents/document-store.ts';
import type { DocumentMetadata } from '../../documents/types.ts';
import type { DocumentResource, DocumentResourceKind } from '../../documents/types.ts';
import { AppError } from '../../errors.ts';
import type { BookRepository } from './book-repository.ts';
import type { BookService } from './book-service.ts';
import { createDocumentReference, parseDocumentReference } from './document-reference.ts';

export interface UploadBookDocumentInput {
  bookId?: string;
  buffer: Buffer;
  name: string;
  version?: string;
}

export interface UploadBookDocumentResult {
  book: Book;
  document: DocumentMetadata;
  edition: BookEdition;
}

export class BookDocumentService {
  private readonly books: BookService;
  private readonly repository: BookRepository;
  private readonly documents: DocumentStore;
  private readonly createId: () => string;

  constructor(
    books: BookService,
    repository: BookRepository,
    documents: DocumentStore,
    createId: () => string = randomUUID,
  ) {
    this.books = books;
    this.repository = repository;
    this.documents = documents;
    this.createId = createId;
  }

  async listDocuments(): Promise<DocumentMetadata[]> {
    return this.documents.list();
  }

  async documentResource(id: string, kind: DocumentResourceKind): Promise<DocumentResource> {
    return this.documents.resource(id, kind);
  }

  async upload(input: UploadBookDocumentInput): Promise<UploadBookDocumentResult> {
    const book = input.bookId
      ? await this.books.getBook(input.bookId)
      : await this.books.createBook({ language: 'und', title: defaultTitle(input.name) });
    const uploaded = await this.uploadEdition(book, input);

    if (input.bookId) return uploaded;
    return {
      ...uploaded,
      edition: await this.transitionEdition(book.id, uploaded.edition.id, 'published'),
    };
  }

  async transitionEdition(
    bookId: string,
    editionId: string,
    targetStatus: EditionStatus,
  ): Promise<BookEdition> {
    if (targetStatus === 'published') {
      const edition = await this.books.getEdition(bookId, editionId);
      const documentId = parseDocumentReference(edition.originalDocumentReference);
      if (!documentId) throw unavailableDocument();
      try {
        await this.documents.readText(documentId);
      } catch (error) {
        throw unavailableDocument(error);
      }
    }
    return this.books.transitionEdition(bookId, editionId, targetStatus);
  }

  async removeDocument(documentId: string): Promise<void> {
    const edition = await this.repository.getEditionByDocumentReference(
      createDocumentReference(documentId),
    );
    if (edition) {
      throw new AppError(
        'DOCUMENT_IN_USE',
        'A document referenced by a book edition cannot be deleted.',
        409,
      );
    }
    await this.documents.remove(documentId);
  }

  private async uploadEdition(
    book: Book,
    input: UploadBookDocumentInput,
  ): Promise<UploadBookDocumentResult> {
    const documentId = this.createId();
    const edition = await this.books.addEdition({
      bookId: book.id,
      contentHash: createHash('sha256').update(input.buffer).digest('hex'),
      originalDocumentReference: createDocumentReference(documentId),
      version: input.version?.trim() || '1',
    });
    let document: DocumentMetadata | undefined;

    try {
      await this.books.transitionEdition(book.id, edition.id, 'processing');
      document = await this.documents.import({
        buffer: input.buffer,
        id: documentId,
        name: input.name,
      });
      const ready = await this.books.transitionEdition(book.id, edition.id, 'ready');
      return { book, document, edition: ready };
    } catch (error) {
      if (document) await this.documents.remove(document.id).catch(() => undefined);
      await this.rejectFailedEdition(book.id, edition.id);
      throw error;
    }
  }

  private async rejectFailedEdition(bookId: string, editionId: string): Promise<void> {
    try {
      const edition = await this.books.getEdition(bookId, editionId);
      if (edition.status === 'draft' || edition.status === 'processing') {
        await this.books.transitionEdition(bookId, editionId, 'rejected');
      }
    } catch {
      // Preserve the processing error; repository failures are reported by their original operation.
    }
  }
}

function defaultTitle(name: string): string {
  const safe = basename(name).trim();
  const extension = extname(safe);
  return (safe.slice(0, extension ? -extension.length : undefined).trim() || 'Imported document')
    .slice(0, 500);
}

function unavailableDocument(cause?: unknown): AppError {
  return new AppError(
    'EDITION_DOCUMENT_UNAVAILABLE',
    'The edition cannot be published because its processed document is unavailable.',
    409,
    cause === undefined ? undefined : { cause },
  );
}
