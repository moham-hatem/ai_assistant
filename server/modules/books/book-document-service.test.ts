import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DocumentStore } from '../../documents/document-store.ts';
import { DocumentProcessingService } from '../../documents/document-processing-service.ts';
import type { DocumentProcessorPort } from '../../documents/document-processor-port.ts';
import { PdfDocumentProcessor } from '../../documents/pdf-document-processor.ts';
import { AppError } from '../../errors.ts';
import { LocalKnowledgeSource } from '../../knowledge/local-knowledge.ts';
import { BookDocumentEvidenceSource } from './book-document-evidence.ts';
import { BookDocumentService } from './book-document-service.ts';
import { BookService } from './book-service.ts';
import { SqliteBookRepository } from './sqlite-book-repository.ts';
import { SecurityAuditService } from '../security-audit/service.ts';
import { SqliteSecurityAuditRepository } from '../security-audit/sqlite-repository.ts';

test('upload stages a ready edition, rejects duplicate fingerprints, and excludes it from search', async () => {
  await withApplication(async ({ application, books, knowledge, repository }) => {
    const book = await books.createBook({ language: 'en', title: 'Lifecycle book' });
    const buffer = lesson('staged-only-marker');
    const uploaded = await application.upload({
      bookId: book.id,
      buffer,
      name: 'lesson.txt',
      version: 'v1',
    });

    assert.equal(uploaded.edition.status, 'ready');
    assert.equal((await application.listDocuments()).length, 1);
    assert.equal(publishedEditions(await repository.listDocumentEditions()).length, 0);
    assert.equal((await knowledge.search('staged-only-marker', 3)).evidence.length, 0);

    await assert.rejects(
      application.upload({ bookId: book.id, buffer, name: 'copy.txt', version: 'v2' }),
      (error: unknown) => error instanceof AppError && error.code === 'DUPLICATE_EDITION',
    );
    assert.equal((await books.listEditions(book.id, { limit: 10, offset: 0 })).total, 1);
  });
});

test('extraction failure rejects the edition without leaving document metadata', async () => {
  await withApplication(async ({ application, books }) => {
    const book = await books.createBook({ language: 'en', title: 'Broken upload' });

    await assert.rejects(
      application.upload({
        bookId: book.id,
        buffer: Buffer.from('too short', 'utf8'),
        name: 'broken.txt',
        version: 'v1',
      }),
      (error: unknown) => error instanceof AppError && error.code === 'DOCUMENT_EXTRACTION_FAILED',
    );

    const editions = await books.listEditions(book.id, { limit: 10, offset: 0 });
    assert.equal(editions.total, 1);
    assert.equal(editions.items[0]?.status, 'rejected');
    assert.deepEqual(await application.listDocuments(), []);
  });
});

test('scanned PDF upload preserves source and metadata when local OCR tools are unavailable', async () => {
  const source = Buffer.from('scanned-pdf-source');
  const processor = new PdfDocumentProcessor({
    async extractDetailed() {
      return {
        averageConfidence: 0,
        pages: [{
          confidence: 0,
          ocrReasons: ['too_few_characters'],
          pageNumber: 1,
          source: 'native',
          status: 'needs_ocr',
          text: '',
        }],
        reason: 'tool_unavailable',
        status: 'needs_ocr',
      };
    },
  });

  await withApplication(async ({ application, books, documents }) => {
    const book = await books.createBook({ language: 'ar', title: 'Scanned source' });
    const uploaded = await application.upload({
      bookId: book.id,
      buffer: source,
      name: 'scan.pdf',
      version: 'v1',
    });

    assert.equal(uploaded.document.processing.status, 'ocr_required');
    assert.equal(uploaded.document.processing.failureCode, 'PDF_OCR_TOOL_UNAVAILABLE');
    assert.equal(uploaded.edition.status, 'processing');
    assert.deepEqual((await documents.readSource(uploaded.document.id)).source, source);
    assert.equal((await application.listDocuments()).length, 1);
  }, processor);
});

test('reprocessing that requires OCR review keeps the edition processing', async () => {
  const processor: DocumentProcessorPort = {
    async process() {
      return {
        text: 'Low confidence OCR output with enough content for manual review.',
        summary: {
          averageConfidence: 0.65,
          failureCode: null,
          lowConfidencePageCount: 1,
          method: 'ocr',
          ocrPageCount: 1,
          pageCount: 1,
          processedAt: null,
          status: 'review_required',
        },
      };
    },
  };

  await withApplication(async ({ application, books }) => {
    const book = await books.createBook({ language: 'en', title: 'Review lifecycle' });
    const uploaded = await application.upload({
      bookId: book.id,
      buffer: lesson('review-reprocess-marker'),
      name: 'lesson.txt',
    });
    assert.equal(uploaded.edition.status, 'ready');

    const processing = await application.reprocessEdition(book.id, uploaded.edition.id);
    assert.equal(processing.summary.status, 'review_required');
    assert.equal((await books.getEdition(book.id, uploaded.edition.id)).status, 'processing');
  }, processor);
});

test('OCR approval retries after the file becomes ready before the SQLite transition', async () => {
  const processor: DocumentProcessorPort = {
    async process() {
      return {
        text: 'Reviewed OCR output with enough safe text for the processing state.',
        summary: {
          averageConfidence: 0.65,
          failureCode: null,
          lowConfidencePageCount: 1,
          method: 'ocr',
          ocrPageCount: 1,
          pageCount: 1,
          processedAt: null,
          status: 'review_required',
        },
      };
    },
  };

  await withApplication(async ({ application, audit, books, documents }) => {
    const book = await books.createBook({ language: 'en', title: 'Retry approval' });
    const uploaded = await application.upload({
      bookId: book.id,
      buffer: lesson('ocr-retry-marker'),
      name: 'lesson.txt',
    });
    await application.reprocessEdition(book.id, uploaded.edition.id);
    const requestId = randomUUID();
    await books.beginOcrApproval(book.id, uploaded.edition.id, uploaded.document.id, {
      actorUserId: 'reviewer-1', requestId,
    });
    const fileProcessing = new DocumentProcessingService(documents, processor);
    await fileProcessing.approveReview(uploaded.document.id);

    assert.equal((await application.editionProcessing(book.id, uploaded.edition.id)).summary.status, 'ready');
    assert.equal((await books.getEdition(book.id, uploaded.edition.id)).status, 'processing');

    const recovered = await application.approveEditionProcessing(
      book.id, uploaded.edition.id, 'reviewer-1', randomUUID(),
    );
    assert.equal(recovered.edition.status, 'ready');
    const events = await audit.list({ action: 'document.ocr_approved', limit: 10, offset: 0 });
    assert.equal(events.total, 1);
    assert.equal(events.items[0]?.requestId, requestId);
    assert.equal(JSON.stringify(events).includes('Reviewed OCR output'), false);
  }, processor);
});

test('publishing atomically selects the edition for knowledge search', async () => {
  await withApplication(async ({ application, books, knowledge, repository }) => {
    const book = await books.createBook({ language: 'en', title: 'Published book' });
    const uploaded = await application.upload({
      bookId: book.id,
      buffer: lesson('published-lifecycle-marker'),
      name: 'published.txt',
      version: 'v1',
    });

    const published = await application.transitionEdition(book.id, uploaded.edition.id, 'published');
    const result = await knowledge.search('published-lifecycle-marker', 3);
    assert.equal(published.status, 'published');
    assert.equal(publishedEditions(await repository.listDocumentEditions()).length, 1);
    assert.equal(result.fileCount, 1);
    assert.match(result.evidence[0]?.content ?? '', /published-lifecycle-marker/u);
  });
});

test('publication preflight leaves metadata ready when the processed document is missing', async () => {
  await withApplication(async ({ application, books, repository }) => {
    const book = await books.createBook({ language: 'en', title: 'Missing document' });
    const edition = await books.addEdition({
      bookId: book.id,
      contentHash: 'a'.repeat(64),
      originalDocumentReference: `document:${crypto.randomUUID()}`,
      version: 'v1',
    });
    await books.transitionEdition(book.id, edition.id, 'processing');
    await books.transitionEdition(book.id, edition.id, 'ready');

    await assert.rejects(
      application.transitionEdition(book.id, edition.id, 'published'),
      (error: unknown) => error instanceof AppError
        && error.code === 'EDITION_DOCUMENT_UNAVAILABLE',
    );
    assert.equal((await books.getEdition(book.id, edition.id)).status, 'ready');
    assert.deepEqual(publishedEditions(await repository.listDocumentEditions()), []);
  });
});

test('legacy one-step upload remains compatible and publishes an implicit book edition', async () => {
  await withApplication(async ({ application, books, knowledge }) => {
    const uploaded = await application.upload({
      buffer: lesson('legacy-upload-marker'),
      name: 'legacy lesson.txt',
    });

    assert.equal(uploaded.book.language, 'und');
    assert.equal(uploaded.edition.status, 'published');
    assert.equal((await books.listBooks({ limit: 10, offset: 0 })).total, 1);
    assert.match(
      (await knowledge.search('legacy-upload-marker', 3)).evidence[0]?.content ?? '',
      /legacy-upload-marker/u,
    );
  });
});

test('failed implicit upload leaves only a rejected attempt and no partial document', async () => {
  await withApplication(async ({ application, books, repository }) => {
    await assert.rejects(
      application.upload({ buffer: Buffer.from('too short'), name: 'broken.txt' }),
      (error: unknown) => error instanceof AppError && error.code === 'DOCUMENT_EXTRACTION_FAILED',
    );

    const bookPage = await books.listBooks({ limit: 10, offset: 0 });
    assert.equal(bookPage.total, 1);
    const editions = await books.listEditions(bookPage.items[0]!.id, { limit: 10, offset: 0 });
    assert.equal(editions.items[0]?.status, 'rejected');
    assert.deepEqual(await application.listDocuments(), []);
    assert.deepEqual(publishedEditions(await repository.listDocumentEditions()), []);
  });
});

interface TestContext {
  application: BookDocumentService;
  audit: SecurityAuditService;
  books: BookService;
  knowledge: LocalKnowledgeSource;
  repository: SqliteBookRepository;
  documents: DocumentStore;
}

async function withApplication(
  run: (context: TestContext) => Promise<void>,
  processor?: DocumentProcessorPort,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'book-document-lifecycle-test-'));
  const repository = new SqliteBookRepository(join(root, 'books.sqlite'));
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  const documents = new DocumentStore(join(root, 'documents'), join(root, 'knowledge'));
  const books = new BookService(repository, undefined, undefined, audit);
  const application = new BookDocumentService(books, repository, documents, undefined, processor);
  const knowledge = new LocalKnowledgeSource(
    join(root, 'knowledge'),
    undefined,
    new BookDocumentEvidenceSource(repository, documents),
  );

  try {
    await run({ application, audit, books, documents, knowledge, repository });
  } finally {
    auditRepository.close();
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
}

function lesson(marker: string): Buffer {
  return Buffer.from(
    `Trusted educational material contains ${marker} and enough supporting text for extraction.`,
    'utf8',
  );
}

function publishedEditions(editions: Array<{ status: string }>) {
  return editions.filter((edition) => edition.status === 'published');
}
