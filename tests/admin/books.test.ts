import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedEditionTransitions } from '../../shared/contracts/books.ts';
import {
  BooksApiError,
  parseBookDetail,
  parseBookPage,
  parseEditionDetail,
  parseEditionPage,
} from '../../src/features/admin/books/api/book-parser.ts';
import {
  fetchBook,
  fetchBooks,
  fetchEditions,
  transitionEdition,
} from '../../src/features/admin/books/api/books.ts';
import { fetchBookDetailPage } from '../../src/features/admin/books/api/book-detail.ts';
import {
  canTransitionEdition,
  isCurrentBookRequest,
  nextOffset,
  operatorEditionTransitions,
  previousOffset,
  replaceBook,
  visibleRange,
} from '../../src/features/admin/books/books-state.ts';

const book = {
  authorOrOrganization: 'Learning Centre',
  createdAt: '2026-08-06T08:00:00.000Z',
  id: 'a1111111-1111-4111-8111-111111111111',
  language: 'sw',
  subject: 'Foundations',
  title: 'Learning Book',
  updatedAt: '2026-08-06T09:00:00.000Z',
};

const edition = {
  archivedAt: null,
  bookId: book.id,
  contentHash: 'A'.repeat(64),
  createdAt: '2026-08-06T08:30:00.000Z',
  id: 'b2222222-2222-4222-8222-222222222222',
  originalDocumentReference: 'documents/learning.pdf',
  publishedAt: null,
  status: 'ready',
  version: '2.0',
};

test('book parsers accept list, detail, edition, and response metadata', () => {
  const page = parseBookPage({ items: [book], limit: 12, offset: 0, requestId: 'ignored', total: 1 });
  assert.deepEqual(page.items, [book]);
  assert.deepEqual(parseBookDetail({ book, requestId: 'ignored' }), book);

  const editionPage = parseEditionPage({ items: [edition], limit: 100, offset: 0, total: 1 });
  assert.equal(editionPage.items[0]?.contentHash, 'a'.repeat(64));
  assert.equal(parseEditionDetail({ edition }).status, 'ready');

  assert.deepEqual(parseBookPage({ items: [], limit: 12, offset: 24, total: 1 }).items, []);
});

test('book parsers reject malformed external data', () => {
  assert.throws(() => parseBookPage({ items: [book], limit: 0, offset: 0, total: 1 }), BooksApiError);
  assert.throws(() => parseBookDetail({ book: { ...book, updatedAt: 'not-a-date' } }), BooksApiError);
  assert.throws(() => parseEditionDetail({ edition: { ...edition, contentHash: 'short' } }), BooksApiError);
  assert.throws(() => parseEditionDetail({ edition: { ...edition, status: 'deleted' } }), BooksApiError);
  assert.throws(() => parseEditionPage({ items: [edition], limit: 1, offset: 0, total: 0 }), BooksApiError);
});

test('UI lifecycle actions use the exact shared server transition policy', () => {
  const expected = {
    archived: ['ready'],
    draft: ['processing', 'rejected', 'archived'],
    processing: ['ready', 'rejected', 'archived'],
    published: ['archived'],
    ready: ['published', 'rejected', 'archived'],
    rejected: ['draft', 'archived'],
  } as const;

  for (const [status, transitions] of Object.entries(expected)) {
    assert.deepEqual(allowedEditionTransitions(status as keyof typeof expected), transitions);
    for (const target of Object.keys(expected)) {
      assert.equal(
        canTransitionEdition(status as keyof typeof expected, target as keyof typeof expected),
        transitions.includes(target as never),
      );
    }
  }
});

test('operator actions exclude processing and system-owned readiness transitions', () => {
  assert.deepEqual(operatorEditionTransitions('draft'), ['rejected', 'archived']);
  assert.deepEqual(operatorEditionTransitions('processing'), ['rejected', 'archived']);
  assert.deepEqual(operatorEditionTransitions('ready'), ['published', 'rejected', 'archived']);
  assert.deepEqual(operatorEditionTransitions('published'), ['archived']);
  assert.deepEqual(operatorEditionTransitions('archived'), ['ready']);
  assert.deepEqual(operatorEditionTransitions('rejected'), ['archived']);
  for (const status of ['draft', 'processing', 'ready', 'published', 'rejected', 'archived'] as const) {
    assert.equal(operatorEditionTransitions(status).includes('processing' as never), false);
  }
  assert.equal(operatorEditionTransitions('processing').includes('ready'), false);
});

test('book identity guards prevent stale book or edition page responses', () => {
  assert.equal(isCurrentBookRequest(book.id, book.id, 8, 8), true);
  assert.equal(isCurrentBookRequest('another-book', book.id, 8, 8), false);
  assert.equal(isCurrentBookRequest(book.id, book.id, 16, 8), false);
  assert.equal(isCurrentBookRequest(null, book.id, 8, 8), false);
});

test('book and edition pagination helpers update within independent bounds', () => {
  const updatedBook = { ...book, updatedAt: '2026-08-06T10:00:00.000Z' };
  assert.deepEqual(replaceBook([book], updatedBook), [updatedBook]);
  assert.equal(nextOffset(0, 12, 25), 12);
  assert.equal(nextOffset(24, 12, 25), 24);
  assert.equal(previousOffset(12, 12), 0);
  assert.equal(nextOffset(0, 8, 19), 8);
  assert.equal(nextOffset(16, 8, 19), 16);
  assert.equal(previousOffset(16, 8), 8);
  assert.equal(previousOffset(0, 8), 0);
  assert.deepEqual(visibleRange(12, 4), { start: 13, end: 16 });
  assert.deepEqual(visibleRange(0, 0), { start: 0, end: 0 });
});

test('typed client calls canonical encoded book and edition routes', async () => {
  const calls: Array<{ body: string | null; method: string; url: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ body: typeof init?.body === 'string' ? init.body : null, method: init?.method ?? 'GET', url });
    const payload = url.includes('/transition')
      ? { edition }
      : url.includes('/editions')
        ? { items: [edition], limit: 8, offset: 8, total: 17 }
        : url.includes('?')
          ? { items: [book], limit: 12, offset: 0, total: 1 }
          : { book };
    return Response.json(payload);
  };

  try {
    await fetchBooks(12, 0);
    await fetchBook('book/id');
    await fetchEditions('book/id', 8, 8);
    await transitionEdition('book/id', 'edition/id', 'published');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls, [
    { body: null, method: 'GET', url: '/api/internal/books?limit=12&offset=0' },
    { body: null, method: 'GET', url: '/api/internal/books/book%2Fid' },
    { body: null, method: 'GET', url: '/api/internal/books/book%2Fid/editions?limit=8&offset=8' },
    { body: JSON.stringify({ status: 'published' }), method: 'POST', url: '/api/internal/books/book%2Fid/editions/edition%2Fid/transition' },
  ]);
});

test('reloading after publish shows the target published, previous archived, and touched book', async () => {
  const previous = {
    ...edition,
    id: 'c3333333-3333-4333-8333-333333333333',
    publishedAt: '2026-08-05T10:00:00.000Z',
    status: 'published',
    version: '1.0',
  };
  const publishedAt = '2026-08-06T10:00:00.000Z';
  const originalFetch = globalThis.fetch;
  let hasPublished = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'POST') {
      hasPublished = true;
      return Response.json({ edition: { ...edition, publishedAt, status: 'published' } });
    }
    if (url.includes('/editions')) {
      const items = hasPublished
        ? [
          { ...edition, publishedAt, status: 'published' },
          { ...previous, archivedAt: publishedAt, status: 'archived' },
        ]
        : [edition, previous];
      return Response.json({ items, limit: 8, offset: 0, total: 2 });
    }
    return Response.json({ book: { ...book, updatedAt: hasPublished ? publishedAt : book.updatedAt } });
  };

  try {
    await transitionEdition(book.id, edition.id, 'published');
    const detail = await fetchBookDetailPage(book.id, 8, 0);
    assert.equal(detail.book.updatedAt, publishedAt);
    assert.deepEqual(
      detail.editions.items.map(({ id, status }) => ({ id, status })),
      [
        { id: edition.id, status: 'published' },
        { id: previous.id, status: 'archived' },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('typed client preserves stable backend error codes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 'BOOKS_UNAVAILABLE' }, { status: 503 });
  try {
    await assert.rejects(() => fetchBooks(12, 0), (error: unknown) => {
      assert.ok(error instanceof BooksApiError);
      assert.equal(error.code, 'BOOKS_UNAVAILABLE');
      assert.equal(error.status, 503);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
