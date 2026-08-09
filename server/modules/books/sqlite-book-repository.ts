import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Book,
  BookEdition,
  EditionStatus,
  Page,
  PageQuery,
} from '../../../shared/contracts/books.ts';
import {
  ConcurrentEditionUpdateError,
  DuplicateEditionError,
  type BookRepository,
  type EditionTransitionCommand,
  type OcrApprovalIntent,
} from './book-repository.ts';
import { migrateBookDatabase } from './sqlite-book-migrations.ts';
import type { SecurityAuditSink } from '../security-audit/repository.ts';
import type { SecurityAuditCommand } from '../security-audit/domain.ts';
import { enqueueSecurityAudit, flushSecurityAuditOutbox, migrateSecurityAuditOutbox } from '../security-audit/sqlite-outbox.ts';

interface BookRow {
  author_organization: string | null;
  created_at: string;
  id: string;
  language: string;
  subject: string | null;
  title: string;
  updated_at: string;
}

interface EditionRow {
  archived_at: string | null;
  book_id: string;
  content_hash: string;
  created_at: string;
  id: string;
  original_document_reference: string;
  published_at: string | null;
  status: string;
  version: string;
}

export class SqliteBookRepository implements BookRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    migrateBookDatabase(this.database);
    migrateSecurityAuditOutbox(this.database);
  }

  async createBook(book: Book): Promise<void> {
    this.database.prepare(`
      INSERT INTO books (
        id, title, author_organization, language, subject, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      book.id,
      book.title,
      book.authorOrOrganization,
      book.language,
      book.subject,
      book.createdAt,
      book.updatedAt,
    );
  }

  async getBook(id: string): Promise<Book | undefined> {
    const row = this.database.prepare('SELECT * FROM books WHERE id = ?').get(id) as
      unknown as BookRow | undefined;
    return row ? toBook(row) : undefined;
  }

  async listBooks(query: PageQuery): Promise<Page<Book>> {
    const rows = this.database.prepare(`
      SELECT * FROM books ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(query.limit, query.offset) as unknown as BookRow[];
    const count = this.database.prepare('SELECT COUNT(*) AS total FROM books').get() as
      unknown as { total: number };
    return { items: rows.map(toBook), limit: query.limit, offset: query.offset, total: count.total };
  }

  async addEdition(edition: BookEdition): Promise<void> {
    try {
      transaction(this.database, () => {
        this.database.prepare(`
          INSERT INTO book_editions (
            id, book_id, version, original_document_reference, content_hash,
            status, created_at, published_at, archived_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          edition.id,
          edition.bookId,
          edition.version,
          edition.originalDocumentReference,
          edition.contentHash,
          edition.status,
          edition.createdAt,
          edition.publishedAt,
          edition.archivedAt,
        );
        touchBook(this.database, edition.bookId, edition.createdAt);
      });
    } catch (error) {
      if (isDuplicateContentHash(error)) throw new DuplicateEditionError();
      throw error;
    }
  }

  async getEdition(bookId: string, editionId: string): Promise<BookEdition | undefined> {
    return this.readEdition(bookId, editionId);
  }

  async getEditionByDocumentReference(reference: string): Promise<BookEdition | undefined> {
    const row = this.database.prepare(`
      SELECT * FROM book_editions WHERE original_document_reference = ? LIMIT 1
    `).get(reference) as unknown as EditionRow | undefined;
    return row ? toEdition(row) : undefined;
  }

  async listEditions(bookId: string, query: PageQuery): Promise<Page<BookEdition>> {
    const rows = this.database.prepare(`
      SELECT * FROM book_editions WHERE book_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(bookId, query.limit, query.offset) as unknown as EditionRow[];
    const count = this.database.prepare(`
      SELECT COUNT(*) AS total FROM book_editions WHERE book_id = ?
    `).get(bookId) as unknown as { total: number };
    return {
      items: rows.map(toEdition),
      limit: query.limit,
      offset: query.offset,
      total: count.total,
    };
  }

  async listDocumentEditions(): Promise<BookEdition[]> {
    const rows = this.database.prepare(`
      SELECT * FROM book_editions ORDER BY created_at, id
    `).all() as unknown as EditionRow[];
    return rows.map(toEdition);
  }

  async transitionEdition(command: EditionTransitionCommand): Promise<BookEdition> {
    return transaction(this.database, () => {
      const result = this.database.prepare(`
        UPDATE book_editions
        SET status = ?, archived_at = CASE
          WHEN ? = 'archived' THEN ?
          WHEN ? = 'ready' THEN NULL
          ELSE archived_at
        END
        WHERE id = ? AND book_id = ? AND status = ?
      `).run(
        command.targetStatus,
        command.targetStatus,
        command.at,
        command.targetStatus,
        command.editionId,
        command.bookId,
        command.expectedStatus,
      );
      if (result.changes !== 1) throw new ConcurrentEditionUpdateError();
      touchBook(this.database, command.bookId, command.at);
      if (command.audit) enqueueSecurityAudit(this.database, command.audit);
      return this.requireEdition(command.bookId, command.editionId);
    });
  }

  async publishEdition(command: EditionTransitionCommand): Promise<BookEdition> {
    return transaction(this.database, () => {
      const target = this.requireEdition(command.bookId, command.editionId);
      if (target.status !== command.expectedStatus) throw new ConcurrentEditionUpdateError();

      const previous = this.database.prepare(`
        SELECT id FROM book_editions
        WHERE book_id = ? AND status = 'published' AND id <> ?
      `).get(command.bookId, command.editionId) as unknown as { id: string } | undefined;

      this.database.prepare(`
        UPDATE book_editions SET status = 'archived', archived_at = ?
        WHERE book_id = ? AND status = 'published' AND id <> ?
      `).run(command.at, command.bookId, command.editionId);
      const result = this.database.prepare(`
        UPDATE book_editions SET status = 'published', published_at = ?, archived_at = NULL
        WHERE id = ? AND book_id = ? AND status = ?
      `).run(command.at, command.editionId, command.bookId, command.expectedStatus);
      if (result.changes !== 1) throw new ConcurrentEditionUpdateError();
      touchBook(this.database, command.bookId, command.at);
      if (previous && command.archiveAudit) {
        enqueueSecurityAudit(this.database, { ...command.archiveAudit, subjectId: previous.id });
      }
      if (command.audit) enqueueSecurityAudit(this.database, command.audit);
      return this.requireEdition(command.bookId, command.editionId);
    });
  }

  async beginOcrApproval(intent: OcrApprovalIntent): Promise<OcrApprovalIntent> {
    return transaction(this.database, () => {
      const edition = this.requireEdition(intent.bookId, intent.editionId);
      if (edition.status !== 'processing') throw new ConcurrentEditionUpdateError();
      this.database.prepare(`
        INSERT OR IGNORE INTO book_ocr_approval_intents (
          edition_id, book_id, document_id, actor_user_id, request_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        intent.editionId, intent.bookId, intent.documentId,
        intent.actorUserId, intent.requestId, intent.createdAt,
      );
      const stored = this.readOcrApprovalIntent(intent.editionId);
      if (!stored || stored.bookId !== intent.bookId || stored.documentId !== intent.documentId
          || stored.actorUserId !== intent.actorUserId) {
        throw new ConcurrentEditionUpdateError();
      }
      return stored;
    });
  }

  async completeOcrApproval(
    intent: OcrApprovalIntent,
    audit: SecurityAuditCommand,
  ): Promise<BookEdition> {
    return transaction(this.database, () => {
      const stored = this.readOcrApprovalIntent(intent.editionId);
      if (!stored || !sameOcrApprovalIntent(stored, intent)) {
        throw new ConcurrentEditionUpdateError();
      }
      const result = this.database.prepare(`
        UPDATE book_editions SET status = 'ready', archived_at = NULL
        WHERE id = ? AND book_id = ? AND status = 'processing'
      `).run(intent.editionId, intent.bookId);
      if (result.changes !== 1) throw new ConcurrentEditionUpdateError();
      touchBook(this.database, intent.bookId, audit.timestamp);
      enqueueSecurityAudit(this.database, audit);
      this.database.prepare(
        'DELETE FROM book_ocr_approval_intents WHERE edition_id = ?',
      ).run(intent.editionId);
      return this.requireEdition(intent.bookId, intent.editionId);
    });
  }

  close(): void {
    this.database.close();
  }

  flushSecurityAuditOutbox(sink: SecurityAuditSink): Promise<number> {
    return flushSecurityAuditOutbox(this.database, sink);
  }

  private readEdition(bookId: string, editionId: string): BookEdition | undefined {
    const row = this.database.prepare(`
      SELECT * FROM book_editions WHERE book_id = ? AND id = ?
    `).get(bookId, editionId) as unknown as EditionRow | undefined;
    return row ? toEdition(row) : undefined;
  }

  private requireEdition(bookId: string, editionId: string): BookEdition {
    const edition = this.readEdition(bookId, editionId);
    if (!edition) throw new ConcurrentEditionUpdateError();
    return edition;
  }

  private readOcrApprovalIntent(editionId: string): OcrApprovalIntent | undefined {
    const row = this.database.prepare(`
      SELECT * FROM book_ocr_approval_intents WHERE edition_id = ?
    `).get(editionId) as unknown as {
      actor_user_id: string; book_id: string; created_at: string;
      document_id: string; edition_id: string; request_id: string;
    } | undefined;
    return row ? {
      actorUserId: row.actor_user_id,
      bookId: row.book_id,
      createdAt: row.created_at,
      documentId: row.document_id,
      editionId: row.edition_id,
      requestId: row.request_id,
    } : undefined;
  }
}

function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = operation();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

function touchBook(database: DatabaseSync, bookId: string, at: string): void {
  database.prepare('UPDATE books SET updated_at = ? WHERE id = ?').run(at, bookId);
}

function isDuplicateContentHash(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('UNIQUE constraint failed: book_editions.book_id, book_editions.content_hash');
}

function sameOcrApprovalIntent(left: OcrApprovalIntent, right: OcrApprovalIntent): boolean {
  return left.actorUserId === right.actorUserId
    && left.bookId === right.bookId
    && left.createdAt === right.createdAt
    && left.documentId === right.documentId
    && left.editionId === right.editionId
    && left.requestId === right.requestId;
}

function toBook(row: BookRow): Book {
  return {
    authorOrOrganization: row.author_organization,
    createdAt: row.created_at,
    id: row.id,
    language: row.language,
    subject: row.subject,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function toEdition(row: EditionRow): BookEdition {
  return {
    archivedAt: row.archived_at,
    bookId: row.book_id,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    id: row.id,
    originalDocumentReference: row.original_document_reference,
    publishedAt: row.published_at,
    status: row.status as EditionStatus,
    version: row.version,
  };
}
