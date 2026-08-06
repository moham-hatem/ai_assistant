import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { Book, BookEdition, EditionStatus } from '../../../shared/contracts/books.ts';
import { AppError } from '../../errors.ts';
import { DuplicateEditionError } from './book-repository.ts';
import { BookService } from './book-service.ts';
import { SqliteBookRepository } from './sqlite-book-repository.ts';

test('SQLite book repository migrates, paginates, prevents duplicate content, and persists restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'book-repository-test-'));
  const path = join(directory, 'books.sqlite');
  let repository = new SqliteBookRepository(path);
  const book = makeBook({ language: 'am-Ethi' });
  const edition = makeEdition(book.id, 'a'.repeat(64));

  try {
    await repository.createBook(book);
    await repository.addEdition(edition);
    await assert.rejects(
      repository.addEdition(makeEdition(book.id, edition.contentHash, { id: crypto.randomUUID() })),
      DuplicateEditionError,
    );

    const books = await repository.listBooks({ limit: 1, offset: 0 });
    const editions = await repository.listEditions(book.id, { limit: 1, offset: 0 });
    assert.equal(books.total, 1);
    assert.equal(books.items[0]?.language, 'am-Ethi');
    assert.equal(editions.total, 1);
    assert.equal(editions.items[0]?.status, 'draft');

    repository.close();
    repository = new SqliteBookRepository(path);
    assert.deepEqual(await repository.getBook(book.id), {
      ...book,
      updatedAt: edition.createdAt,
    });
    assert.deepEqual(await repository.getEdition(book.id, edition.id), edition);

    const database = new DatabaseSync(path);
    const version = database.prepare('PRAGMA user_version').get() as unknown as { user_version: number };
    database.close();
    assert.equal(version.user_version, 1);
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('publishing archives the previous edition atomically and rolls back on failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'book-publish-test-'));
  const path = join(directory, 'books.sqlite');
  let repository = new SqliteBookRepository(path);
  const book = makeBook();
  const first = makeEdition(book.id, '1'.repeat(64));
  const second = makeEdition(book.id, '2'.repeat(64), { id: crypto.randomUUID(), version: '2' });

  try {
    await repository.createBook(book);
    await repository.addEdition(first);
    await repository.addEdition(second);
    await move(repository, first, 'processing');
    await move(repository, first, 'ready', 'processing');
    await repository.publishEdition(command(first, 'ready', 'published', '2026-08-06T10:03:00.000Z'));
    await move(repository, second, 'processing');
    await move(repository, second, 'ready', 'processing');

    repository.close();
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TRIGGER fail_selected_publish
      BEFORE UPDATE OF status ON book_editions
      WHEN NEW.id = '${second.id}' AND NEW.status = 'published'
      BEGIN SELECT RAISE(ABORT, 'forced publish failure'); END;
    `);
    database.close();
    repository = new SqliteBookRepository(path);

    await assert.rejects(
      repository.publishEdition(command(second, 'ready', 'published', '2026-08-06T10:06:00.000Z')),
      /forced publish failure/u,
    );
    assert.equal((await repository.getEdition(book.id, first.id))?.status, 'published');
    assert.equal((await repository.getEdition(book.id, first.id))?.archivedAt, null);
    assert.equal((await repository.getEdition(book.id, second.id))?.status, 'ready');

    repository.close();
    const cleanup = new DatabaseSync(path);
    cleanup.exec('DROP TRIGGER fail_selected_publish;');
    cleanup.close();
    repository = new SqliteBookRepository(path);
    const published = await repository.publishEdition(
      command(second, 'ready', 'published', '2026-08-06T10:07:00.000Z'),
    );
    const archived = await repository.getEdition(book.id, first.id);
    assert.equal(published.status, 'published');
    assert.equal(published.publishedAt, '2026-08-06T10:07:00.000Z');
    assert.equal(archived?.status, 'archived');
    assert.equal(archived?.archivedAt, '2026-08-06T10:07:00.000Z');
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('service explicitly restores and republishes an archived edition without losing history', async () => {
  const repository = new SqliteBookRepository(':memory:');
  let now = '2026-08-06T11:00:00.000Z';
  const service = new BookService(repository, () => new Date(now));

  try {
    const book = await service.createBook({ language: 'ar', title: 'Rollback test' });
    now = '2026-08-06T11:01:00.000Z';
    const first = await service.addEdition({
      bookId: book.id,
      contentHash: '1'.repeat(64),
      originalDocumentReference: 'documents/v1.pdf',
      version: 'v1',
    });
    now = '2026-08-06T11:02:00.000Z';
    const second = await service.addEdition({
      bookId: book.id,
      contentHash: '2'.repeat(64),
      originalDocumentReference: 'documents/v2.pdf',
      version: 'v2',
    });

    await service.transitionEdition(book.id, first.id, 'processing');
    await service.transitionEdition(book.id, first.id, 'ready');
    now = '2026-08-06T11:05:00.000Z';
    const firstPublication = await service.transitionEdition(book.id, first.id, 'published');
    assert.equal(firstPublication.publishedAt, now);

    await service.transitionEdition(book.id, second.id, 'processing');
    await service.transitionEdition(book.id, second.id, 'ready');
    now = '2026-08-06T11:08:00.000Z';
    await service.transitionEdition(book.id, second.id, 'published');
    assert.deepEqual(
      await repository.getEdition(book.id, first.id),
      { ...firstPublication, archivedAt: now, status: 'archived' },
    );

    await assert.rejects(
      service.transitionEdition(book.id, first.id, 'published'),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_EDITION_TRANSITION',
    );
    now = '2026-08-06T11:09:00.000Z';
    const restored = await service.transitionEdition(book.id, first.id, 'ready');
    assert.equal(restored.status, 'ready');
    assert.equal(restored.archivedAt, null);
    assert.equal(restored.publishedAt, firstPublication.publishedAt);

    now = '2026-08-06T11:10:00.000Z';
    const republished = await service.transitionEdition(book.id, first.id, 'published');
    const archivedSecond = await repository.getEdition(book.id, second.id);
    assert.equal(republished.status, 'published');
    assert.equal(republished.publishedAt, now);
    assert.equal(republished.archivedAt, null);
    assert.equal(archivedSecond?.status, 'archived');
    assert.equal(archivedSecond?.archivedAt, now);

    const history = await service.listEditions(book.id, { limit: 10, offset: 0 });
    assert.equal(history.total, 2);
    assert.deepEqual(
      new Set(history.items.map((edition) => edition.contentHash)),
      new Set(['1'.repeat(64), '2'.repeat(64)]),
    );
  } finally {
    repository.close();
  }
});

async function move(
  repository: SqliteBookRepository,
  edition: BookEdition,
  targetStatus: EditionStatus,
  expectedStatus: EditionStatus = 'draft',
): Promise<void> {
  await repository.transitionEdition(command(edition, expectedStatus, targetStatus));
}

function command(
  edition: BookEdition,
  expectedStatus: EditionStatus,
  targetStatus: EditionStatus,
  at = '2026-08-06T10:02:00.000Z',
) {
  return { at, bookId: edition.bookId, editionId: edition.id, expectedStatus, targetStatus };
}

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    authorOrOrganization: null,
    createdAt: '2026-08-06T10:00:00.000Z',
    id: crypto.randomUUID(),
    language: 'ar',
    subject: null,
    title: 'Test book',
    updatedAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  };
}

function makeEdition(
  bookId: string,
  contentHash: string,
  overrides: Partial<BookEdition> = {},
): BookEdition {
  return {
    archivedAt: null,
    bookId,
    contentHash,
    createdAt: '2026-08-06T10:01:00.000Z',
    id: crypto.randomUUID(),
    originalDocumentReference: 'documents/test.pdf',
    publishedAt: null,
    status: 'draft',
    version: '1',
    ...overrides,
  };
}
