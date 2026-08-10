import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AuthPrincipal } from '../../../shared/contracts/auth.ts';
import type { DocumentProcessorPort } from '../../documents/document-processor-port.ts';
import { DocumentStore } from '../../documents/document-store.ts';
import { BookDocumentService } from './book-document-service.ts';
import { BookService } from './book-service.ts';
import { createBooksHandler } from './books-handler.ts';
import { SqliteBookRepository } from './sqlite-book-repository.ts';
import { UnavailableBookRepository } from './unavailable-book-repository.ts';
import { SecurityAuditService } from '../security-audit/service.ts';
import { SqliteSecurityAuditRepository } from '../security-audit/sqlite-repository.ts';
import { randomBytes } from 'node:crypto';

test('internal book API validates input, paginates, and drives edition publication explicitly', async () => {
  const repository = new SqliteBookRepository(':memory:');
  const service = new BookService(repository);
  const handler = createBooksHandler(service, () => undefined);

  try {
    await withServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      void handler(request, response, url, principal);
    }, async (baseUrl) => {
      const invalid = await jsonRequest(`${baseUrl}/api/internal/books`, 'POST', { language: 'ar' });
      assert.equal(invalid.response.status, 400);
      assert.equal(invalid.body.code, 'INVALID_REQUEST');

      const created = await jsonRequest(`${baseUrl}/api/internal/books`, 'POST', {
        authorOrOrganization: 'Independent publisher',
        language: 'zh-Hant',
        title: 'Open-language book',
      });
      assert.equal(created.response.status, 201);
      const book = created.body.book as { id: string; language: string };
      assert.equal(book.language, 'zh-Hant');

      const list = await jsonRequest(`${baseUrl}/api/internal/books?limit=1&offset=0`);
      assert.equal(list.response.status, 200);
      assert.equal(list.body.total, 1);
      assert.equal((list.body.items as unknown[]).length, 1);
      const invalidPage = await jsonRequest(`${baseUrl}/api/internal/books?limit=0`);
      assert.equal(invalidPage.response.status, 400);

      const editionInput = {
        contentHash: 'A'.repeat(64),
        originalDocumentReference: 'documents/source.pdf',
        version: 1,
      };
      const added = await jsonRequest(
        `${baseUrl}/api/internal/books/${book.id}/editions`,
        'POST',
        editionInput,
      );
      assert.equal(added.response.status, 201);
      const edition = added.body.edition as { id: string; status: string; version: string };
      assert.deepEqual({ status: edition.status, version: edition.version }, { status: 'draft', version: '1' });

      const duplicate = await jsonRequest(
        `${baseUrl}/api/internal/books/${book.id}/editions`,
        'POST',
        { ...editionInput, version: 'duplicate' },
      );
      assert.equal(duplicate.response.status, 409);
      assert.equal(duplicate.body.code, 'DUPLICATE_EDITION');

      const directPublish = await transition(baseUrl, book.id, edition.id, 'published');
      assert.equal(directPublish.response.status, 409);
      assert.equal(directPublish.body.code, 'INVALID_EDITION_TRANSITION');
      assert.equal((await transition(baseUrl, book.id, edition.id, 'processing')).response.status, 200);
      assert.equal((await transition(baseUrl, book.id, edition.id, 'ready')).response.status, 200);
      const published = await transition(baseUrl, book.id, edition.id, 'published');
      assert.equal(published.response.status, 200);
      assert.equal((published.body.edition as { status: string }).status, 'published');

      const editions = await jsonRequest(
        `${baseUrl}/api/internal/books/${book.id}/editions?limit=25&offset=0`,
      );
      assert.equal(editions.body.total, 1);
      assert.equal(((editions.body.items as Array<{ status: string }>)[0]).status, 'published');
    });
  } finally {
    repository.close();
  }
});

test('internal book API reports database initialization failure without exposing its cause', async () => {
  const handler = createBooksHandler(
    new BookService(new UnavailableBookRepository(new Error('secret filesystem detail'))),
    () => undefined,
  );
  await withServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    void handler(request, response, url, principal);
  }, async (baseUrl) => {
    const result = await jsonRequest(`${baseUrl}/api/internal/books`);
    assert.equal(result.response.status, 503);
    assert.equal(result.body.code, 'BOOKS_UNAVAILABLE');
    assert.equal(JSON.stringify(result.body).includes('secret filesystem detail'), false);
  });
});

test('processing API reports state, reprocesses drafts, and refuses published editions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'books-processing-handler-test-'));
  const repository = new SqliteBookRepository(join(root, 'books.sqlite'));
  const service = new BookService(repository);
  let calls = 0;
  const processor: DocumentProcessorPort = {
    async process() {
      calls += 1;
      return {
        text: 'Reprocessed document text with enough content for publication.',
        summary: {
          averageConfidence: 0.98,
          failureCode: null,
          lowConfidencePageCount: 0,
          method: 'ocr',
          ocrPageCount: 2,
          pageCount: 2,
          processedAt: '2026-08-09T10:00:00.000Z',
          status: 'ready',
        },
      };
    },
  };
  const operations = new BookDocumentService(
    service,
    repository,
    new DocumentStore(join(root, 'documents'), join(root, 'knowledge')),
    undefined,
    processor,
  );
  const handler = createBooksHandler(service, () => undefined, operations);

  try {
    const book = await service.createBook({ language: 'en', title: 'Processing API' });
    const uploaded = await operations.upload({
      bookId: book.id,
      buffer: Buffer.from('Initial document text with enough content for a normal import.'),
      name: 'edition.txt',
    });
    await withServer((request, response) => {
      void handler(request, response, new URL(request.url ?? '/', 'http://localhost'), principal);
    }, async (baseUrl) => {
      const endpoint = `${baseUrl}/api/internal/books/${book.id}/editions/${uploaded.edition.id}/processing`;
      const before = await jsonRequest(endpoint);
      assert.equal(before.response.status, 200);
      assert.equal(
        ((before.body.processing as { summary: { status: string } }).summary.status),
        'ready',
      );

      const reprocessed = await jsonRequest(endpoint, 'POST');
      assert.equal(reprocessed.response.status, 200);
      assert.deepEqual(reprocessed.body.processing, {
        generation: 1,
        summary: {
          averageConfidence: 0.98,
          failureCode: null,
          lowConfidencePageCount: 0,
          method: 'ocr',
          ocrPageCount: 2,
          pageCount: 2,
          processedAt: '2026-08-09T10:00:00.000Z',
          status: 'ready',
        },
      });
      assert.equal((await service.getEdition(book.id, uploaded.edition.id)).status, 'ready');
      await operations.transitionEdition(book.id, uploaded.edition.id, 'published');
      const forbidden = await jsonRequest(endpoint, 'POST');
      assert.equal(forbidden.response.status, 409);
      assert.equal(forbidden.body.code, 'PUBLISHED_EDITION_REPROCESS_FORBIDDEN');
      assert.equal(calls, 1);
      assert.equal((await service.getEdition(book.id, uploaded.edition.id)).status, 'published');
    });
  } finally {
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('OCR review approval readies the document and edition without publishing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'books-approval-handler-test-'));
  const repository = new SqliteBookRepository(join(root, 'books.sqlite'));
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  const service = new BookService(repository, undefined, undefined, audit);
  const processor: DocumentProcessorPort = {
    async process() {
      return {
        text: 'Reviewed OCR text with enough useful content to approve safely.',
        summary: {
          averageConfidence: 0.68,
          failureCode: null,
          lowConfidencePageCount: 1,
          method: 'ocr',
          ocrPageCount: 1,
          pageCount: 1,
          processedAt: '2026-08-09T10:00:00.000Z',
          status: 'review_required',
        },
      };
    },
  };
  const operations = new BookDocumentService(
    service,
    repository,
    new DocumentStore(join(root, 'documents'), join(root, 'knowledge')),
    undefined,
    processor,
  );
  let boundaryActorId: string | undefined;
  const handler = createBooksHandler(service, () => undefined, {
    approveEditionProcessing: async (bookId, editionId, actorId) => {
      boundaryActorId = actorId;
      return operations.approveEditionProcessing(bookId, editionId, actorId);
    },
    editionProcessing: operations.editionProcessing.bind(operations),
    reprocessEdition: operations.reprocessEdition.bind(operations),
    transitionEdition: operations.transitionEdition.bind(operations),
  });

  try {
    const book = await service.createBook({ language: 'ar', title: 'OCR review' });
    const uploaded = await operations.upload({
      bookId: book.id,
      buffer: Buffer.from('pdf source'),
      name: 'review.pdf',
    });
    assert.equal(uploaded.document.processing.status, 'review_required');
    assert.equal(uploaded.edition.status, 'processing');

    await withServer((request, response) => {
      void handler(request, response, new URL(request.url ?? '/', 'http://localhost'), principal);
    }, async (baseUrl) => {
      const endpoint = `${baseUrl}/api/internal/books/${book.id}/editions/${uploaded.edition.id}/processing/approve`;
      const approved = await jsonRequest(endpoint, 'POST', { actorId: crypto.randomUUID() });
      assert.equal(approved.response.status, 200);
      assert.equal(boundaryActorId, principal.id);
      assert.equal(
        ((approved.body.processing as { summary: { status: string } }).summary.status),
        'ready',
      );
      assert.equal((approved.body.edition as { status: string }).status, 'ready');
      assert.equal((await service.getEdition(book.id, uploaded.edition.id)).status, 'ready');
      const events = await audit.list({ action: 'document.ocr_approved', limit: 10, offset: 0 });
      assert.equal(events.total, 1);
      assert.equal(events.items[0]?.actorUserId, principal.id);
      assert.deepEqual(events.items[0]?.metadata, { fromStatus: 'processing', toStatus: 'ready' });
      assert.equal(JSON.stringify(events).includes('Reviewed OCR text'), false);

      await operations.transitionEdition(book.id, uploaded.edition.id, 'published');
      const published = await jsonRequest(endpoint, 'POST', { actorId: crypto.randomUUID() });
      assert.equal(published.response.status, 409);
      assert.equal(published.body.code, 'PUBLISHED_EDITION_REVIEW_FORBIDDEN');
      assert.equal((await service.getEdition(book.id, uploaded.edition.id)).status, 'published');
    });
  } finally {
    auditRepository.close();
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
});

const principal: AuthPrincipal = {
  displayName: 'Content Reviewer',
  email: 'reviewer@example.test',
  id: 'e5555555-5555-4555-8555-555555555555',
  permissions: ['books:read', 'books:write', 'content:review'],
  roles: ['content_manager'],
};

function transition(baseUrl: string, bookId: string, editionId: string, status: string) {
  return jsonRequest(
    `${baseUrl}/api/internal/books/${bookId}/editions/${editionId}/transition`,
    'POST',
    { status },
  );
}

async function jsonRequest(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() as Record<string, unknown> };
}

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
