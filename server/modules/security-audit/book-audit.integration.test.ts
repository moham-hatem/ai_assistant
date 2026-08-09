import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { BookService } from '../books/book-service.ts';
import { SqliteBookRepository } from '../books/sqlite-book-repository.ts';
import { SecurityAuditService } from './service.ts';
import { SqliteSecurityAuditRepository } from './sqlite-repository.ts';

test('edition status, publication, and restoration use the durable audit boundary', async () => {
  const books = new SqliteBookRepository(':memory:');
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  const service = new BookService(books, undefined, undefined, audit);
  const context = { actorUserId: 'content-manager', requestId: randomUUID() };
  try {
    const book = await service.createBook({ language: 'ar', title: 'Metadata only' });
    const edition = await service.addEdition({
      bookId: book.id, contentHash: 'a'.repeat(64),
      originalDocumentReference: 'document:test', version: '1',
    });
    await service.transitionEdition(book.id, edition.id, 'processing', context);
    await service.transitionEdition(book.id, edition.id, 'ready', context);
    await service.transitionEdition(book.id, edition.id, 'published', context);
    await service.transitionEdition(book.id, edition.id, 'archived', context);
    await service.transitionEdition(book.id, edition.id, 'ready', context);
    const second = await service.addEdition({
      bookId: book.id, contentHash: 'b'.repeat(64),
      originalDocumentReference: 'document:second', version: '2',
    });
    await service.transitionEdition(book.id, second.id, 'processing', context);
    await service.transitionEdition(book.id, second.id, 'ready', context);
    await service.transitionEdition(book.id, second.id, 'published', context);
    const events = await audit.list({ limit: 20, offset: 0 });
    assert.equal(events.items.some((event) => event.action === 'book.edition_published'), true);
    assert.equal(events.items.some((event) => event.action === 'book.edition_restored'), true);
    assert.equal(events.items.some((event) => event.action === 'book.edition_status_changed'), true);
    assert.equal(events.items.every((event) => event.actorUserId === context.actorUserId), true);
    const automaticArchive = events.items.find((event) =>
      event.action === 'book.edition_status_changed'
      && event.subjectId === edition.id
      && event.metadata.toStatus === 'archived');
    assert.ok(automaticArchive);
    assert.equal(automaticArchive.requestId, context.requestId);
  } finally {
    books.close();
    auditRepository.close();
  }
});

test('a sensitive change fails its call but remains retryable when audit delivery is down', async () => {
  const books = new SqliteBookRepository(':memory:');
  const unavailableRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const unavailableAudit = new SecurityAuditService(unavailableRepository);
  unavailableRepository.close();
  const service = new BookService(books, undefined, undefined, unavailableAudit);
  const book = await service.createBook({ language: 'en', title: 'No content in audit' });
  const edition = await service.addEdition({
    bookId: book.id, contentHash: 'b'.repeat(64),
    originalDocumentReference: 'document:retry', version: '1',
  });
  await assert.rejects(service.transitionEdition(book.id, edition.id, 'processing', {
    actorUserId: 'content-manager', requestId: randomUUID(),
  }));
  assert.equal((await service.getEdition(book.id, edition.id)).status, 'processing');

  const recoveredRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const recoveredAudit = new SecurityAuditService(recoveredRepository);
  try {
    assert.equal(await books.flushSecurityAuditOutbox(recoveredAudit), 1);
    assert.equal((await recoveredAudit.list({ limit: 10, offset: 0 })).total, 1);
  } finally {
    recoveredRepository.close();
    books.close();
  }
});
