import { createHash, randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import type { Book, BookEdition, EditionStatus } from '../../../shared/contracts/books.ts';
import type { DocumentProcessingState } from '../../../shared/contracts/document-processing.ts';
import {
  DocumentProcessingService,
} from '../../documents/document-processing-service.ts';
import {
  type DocumentProcessorPort,
  UnavailableDocumentProcessor,
} from '../../documents/document-processor-port.ts';
import type { DocumentStore } from '../../documents/document-store.ts';
import type { DocumentMetadata } from '../../documents/types.ts';
import type { DocumentResource, DocumentResourceKind } from '../../documents/types.ts';
import { AppError } from '../../errors.ts';
import type { BookRepository } from './book-repository.ts';
import type { BookService } from './book-service.ts';
import type { BookAuditContext } from './book-service.ts';
import type { SecurityAuditContext } from '../security-audit/domain.ts';
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

export interface ApproveEditionProcessingResult {
  edition: BookEdition;
  processing: DocumentProcessingState;
}

export class BookDocumentService {
  private readonly books: BookService;
  private readonly repository: BookRepository;
  private readonly documents: DocumentStore;
  private readonly createId: () => string;
  private readonly processor?: DocumentProcessorPort;
  private readonly processing: DocumentProcessingService;

  constructor(
    books: BookService,
    repository: BookRepository,
    documents: DocumentStore,
    createId: () => string = randomUUID,
    processor?: DocumentProcessorPort,
  ) {
    this.books = books;
    this.repository = repository;
    this.documents = documents;
    this.createId = createId;
    this.processor = processor;
    this.processing = new DocumentProcessingService(
      documents,
      processor ?? new UnavailableDocumentProcessor(),
    );
  }

  async listDocuments(): Promise<DocumentMetadata[]> {
    return this.documents.list();
  }

  async documentResource(id: string, kind: DocumentResourceKind): Promise<DocumentResource> {
    return this.documents.resource(id, kind);
  }

  async editionProcessing(bookId: string, editionId: string): Promise<DocumentProcessingState> {
    const documentId = await this.editionDocumentId(bookId, editionId);
    return this.processing.processingState(documentId);
  }

  async reprocessEdition(bookId: string, editionId: string, auditContext?: BookAuditContext): Promise<DocumentProcessingState> {
    let edition = await this.books.getEdition(bookId, editionId);
    if (edition.status === 'published') {
      throw new AppError(
        'PUBLISHED_EDITION_REPROCESS_FORBIDDEN',
        'Published editions cannot be reprocessed in place.',
        409,
      );
    }
    if (edition.status === 'ready') {
      edition = await this.books.reopenEditionProcessing(bookId, editionId, auditContext);
    }
    if (edition.status !== 'processing') {
      throw new AppError(
        'EDITION_REPROCESS_FORBIDDEN',
        'Only ready or processing editions can be reprocessed.',
        409,
      );
    }
    const documentId = parseDocumentReference(edition.originalDocumentReference);
    if (!documentId) throw unavailableDocument();
    const state = await this.processing.reprocess(documentId);
    if (state.summary.status === 'ready') {
      await this.books.transitionEdition(bookId, editionId, 'ready', auditContext);
    }
    return state;
  }

  async approveEditionProcessing(
    bookId: string,
    editionId: string,
    _actorId: string,
    requestId = randomUUID(),
  ): Promise<ApproveEditionProcessingResult> {
    const edition = await this.books.getEdition(bookId, editionId);
    if (edition.status === 'published') {
      throw new AppError(
        'PUBLISHED_EDITION_REVIEW_FORBIDDEN',
        'Published editions cannot be reviewed in place.',
        409,
      );
    }
    if (edition.status !== 'processing') {
      throw new AppError(
        'EDITION_REVIEW_FORBIDDEN',
        'Only processing editions can approve OCR review.',
        409,
      );
    }
    const documentId = parseDocumentReference(edition.originalDocumentReference);
    if (!documentId) throw unavailableDocument();
    const processing = await this.processing.approveReview(documentId);
    return {
      edition: await this.books.transitionEdition(bookId, editionId, 'ready', {
        action: 'document.ocr_approved', actorUserId: _actorId, requestId,
      }),
      processing,
    };
  }

  async upload(input: UploadBookDocumentInput, auditContext?: SecurityAuditContext): Promise<UploadBookDocumentResult> {
    const book = input.bookId
      ? await this.books.getBook(input.bookId)
      : await this.books.createBook({ language: 'und', title: defaultTitle(input.name) });
    const uploaded = await this.uploadEdition(book, input, auditContext);

    if (input.bookId) return uploaded;
    return uploaded.edition.status === 'ready'
      ? { ...uploaded, edition: await this.transitionEdition(book.id, uploaded.edition.id, 'published', auditContext) }
      : uploaded;
  }

  async transitionEdition(
    bookId: string,
    editionId: string,
    targetStatus: EditionStatus,
    auditContext?: BookAuditContext,
  ): Promise<BookEdition> {
    if (targetStatus === 'published') {
      const edition = await this.books.getEdition(bookId, editionId);
      const documentId = parseDocumentReference(edition.originalDocumentReference);
      if (!documentId) throw unavailableDocument();
      try {
        await this.documents.readText(documentId);
        const processing = await this.processing.processingState(documentId);
        if (processing.summary.status !== 'ready') {
          throw new AppError(
            'EDITION_DOCUMENT_NOT_READY',
            'The edition document requires successful processing before publication.',
            409,
          );
        }
      } catch (error) {
        if (error instanceof AppError && error.code === 'EDITION_DOCUMENT_NOT_READY') throw error;
        throw unavailableDocument(error);
      }
    }
    return this.books.transitionEdition(bookId, editionId, targetStatus, auditContext);
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
    auditContext?: SecurityAuditContext,
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
      const processingEdition = await this.books.transitionEdition(book.id, edition.id, 'processing', auditContext);
      document = await this.documents.import({
        buffer: input.buffer,
        id: documentId,
        name: input.name,
      }, this.processor);
      if (document.processing.status !== 'ready') {
        return { book, document, edition: processingEdition };
      }
      const ready = await this.books.transitionEdition(book.id, edition.id, 'ready', auditContext);
      return { book, document, edition: ready };
    } catch (error) {
      if (document) await this.documents.remove(document.id).catch(() => undefined);
      await this.rejectFailedEdition(book.id, edition.id, auditContext);
      throw error;
    }
  }

  private async rejectFailedEdition(
    bookId: string,
    editionId: string,
    auditContext?: SecurityAuditContext,
  ): Promise<void> {
    try {
      const edition = await this.books.getEdition(bookId, editionId);
      if (edition.status === 'draft' || edition.status === 'processing') {
        await this.books.transitionEdition(bookId, editionId, 'rejected', auditContext);
      }
    } catch {
      // Preserve the processing error; repository failures are reported by their original operation.
    }
  }

  private async editionDocumentId(bookId: string, editionId: string): Promise<string> {
    const edition = await this.books.getEdition(bookId, editionId);
    const documentId = parseDocumentReference(edition.originalDocumentReference);
    if (!documentId) throw unavailableDocument();
    return documentId;
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
