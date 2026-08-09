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
  type OcrApprovalIntent,
} from './book-repository.ts';
import type { SecurityAuditService } from '../security-audit/service.ts';
import type { SecurityAuditAction } from '../../../shared/contracts/security-audit.ts';
import type { SecurityAuditCommand, SecurityAuditContext } from '../security-audit/domain.ts';

export interface BookAuditContext extends SecurityAuditContext {
  action?: Extract<SecurityAuditAction, 'document.ocr_approved'>;
}

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
  private readonly audit?: SecurityAuditService;

  constructor(
    repository: BookRepository,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
    audit?: SecurityAuditService,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
    this.audit = audit;
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
    auditContext?: BookAuditContext,
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
    const audit = auditContext && this.audit ? this.auditCommand(
      auditContext,
      edition.status,
      targetStatus,
      editionId,
      command.at,
    ) : undefined;
    const archiveAudit = auditContext && this.audit && targetStatus === 'published'
      ? withoutSubject(this.auditCommand(
        auditContext,
        'published',
        'archived',
        editionId,
        command.at,
      ))
      : undefined;
    const result = await this.call(() => targetStatus === 'published'
      ? this.repository.publishEdition({ ...command, archiveAudit, audit })
      : this.repository.transitionEdition({ ...command, audit }));
    if (audit) await this.flushAudit();
    return result;
  }

  async reopenEditionProcessing(
    bookId: string,
    editionId: string,
    auditContext?: BookAuditContext,
  ): Promise<BookEdition> {
    const edition = await this.getEdition(bookId, editionId);
    if (edition.status !== 'ready') {
      throw new AppError(
        'EDITION_REPROCESS_FORBIDDEN',
        'Only a ready edition can enter system-owned reprocessing.',
        409,
      );
    }
    const at = this.now().toISOString();
    const audit = auditContext && this.audit
      ? this.auditCommand(auditContext, 'ready', 'processing', editionId, at)
      : undefined;
    const result = await this.call(() => this.repository.transitionEdition({
      at,
      audit,
      bookId,
      editionId,
      expectedStatus: 'ready',
      targetStatus: 'processing',
    }));
    if (audit) await this.flushAudit();
    return result;
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

  async beginOcrApproval(
    bookId: string,
    editionId: string,
    documentId: string,
    context: SecurityAuditContext,
  ): Promise<OcrApprovalIntent> {
    if (!this.audit || !this.repository.beginOcrApproval) throw auditUnavailable();
    return this.call(() => this.repository.beginOcrApproval!({
      actorUserId: context.actorUserId,
      bookId,
      createdAt: this.now().toISOString(),
      documentId,
      editionId,
      requestId: context.requestId,
    }));
  }

  async completeOcrApproval(intent: OcrApprovalIntent): Promise<BookEdition> {
    if (!this.audit || !this.repository.completeOcrApproval) throw auditUnavailable();
    const at = this.now().toISOString();
    const audit = this.auditCommand({
      action: 'document.ocr_approved',
      actorUserId: intent.actorUserId,
      requestId: intent.requestId,
    }, 'processing', 'ready', intent.editionId, at);
    const edition = await this.call(() => this.repository.completeOcrApproval!(intent, audit));
    await this.flushAudit();
    return edition;
  }

  private auditCommand(
    context: BookAuditContext,
    fromStatus: EditionStatus,
    toStatus: EditionStatus,
    editionId: string,
    timestamp: string,
  ): SecurityAuditCommand {
    const action: SecurityAuditCommand['action'] = context.action ?? (toStatus === 'published'
      ? 'book.edition_published'
      : fromStatus === 'archived' ? 'book.edition_restored' : 'book.edition_status_changed');
    const metadata = action === 'document.ocr_approved'
      ? { fromStatus, toStatus }
      : action === 'book.edition_status_changed' ? { fromStatus, toStatus } : { fromStatus };
    return {
      action,
      actorUserId: context.actorUserId,
      category: action === 'document.ocr_approved' ? 'documents' as const : 'books' as const,
      id: this.createId(),
      metadata,
      outcome: 'success' as const,
      requestId: context.requestId,
      subjectId: editionId,
      subjectType: 'book_edition',
      timestamp,
    };
  }

  private async flushAudit(): Promise<void> {
    if (this.audit && this.repository.flushSecurityAuditOutbox) {
      await this.repository.flushSecurityAuditOutbox(this.audit);
    }
  }
}

function withoutSubject(command: SecurityAuditCommand): Omit<SecurityAuditCommand, 'subjectId'> {
  const { subjectId: _subjectId, ...rest } = command;
  return rest;
}

function auditUnavailable(): AppError {
  return new AppError(
    'SECURITY_AUDIT_UNAVAILABLE',
    'Security audit is required for this operation.',
    503,
  );
}
