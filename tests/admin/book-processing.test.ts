import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approveEditionProcessing,
  fetchEditionProcessing,
  reprocessEdition,
} from '../../src/features/admin/books/api/book-processing.ts';
import {
  parseEditionProcessingApprovalResponse,
  parseEditionProcessingResponse,
} from '../../src/features/admin/books/api/book-processing-parser.ts';
import { BooksApiError } from '../../src/features/admin/books/api/book-parser.ts';
import { availableProcessingActions } from '../../src/features/admin/books/processing-action-availability.ts';
import {
  documentIdFromReference,
  isCurrentEditionProcessingRequest,
  processingActionFailed,
  processingActionStarted,
  processingLoadFailed,
  processingLoadSucceeded,
  processingPageLoading,
  safeDocumentFailureCode,
} from '../../src/features/admin/books/processing-state.ts';

const bookId = 'a1111111-1111-4111-8111-111111111111';
const editionId = 'b2222222-2222-4222-8222-222222222222';
const state = {
  generation: 3,
  summary: {
    averageConfidence: 0.875,
    failureCode: null,
    lowConfidencePageCount: 2,
    method: 'hybrid',
    ocrPageCount: 4,
    pageCount: 10,
    processedAt: '2026-08-09T18:30:00.000Z',
    status: 'review_required',
  },
} as const;
const approvedState = {
  ...state,
  summary: { ...state.summary, status: 'ready' },
} as const;
const approvedEdition = {
  archivedAt: null,
  bookId,
  contentHash: 'a'.repeat(64),
  createdAt: '2026-08-09T18:00:00.000Z',
  id: editionId,
  originalDocumentReference: 'document:d4444444-4444-4444-8444-444444444444',
  publishedAt: null,
  status: 'ready',
  version: 'scan-v1',
} as const;
const requestId = 'c3333333-3333-4333-8333-333333333333';

test('processing parser accepts a coherent shared summary and matching envelope identity', () => {
  assert.deepEqual(parseEditionProcessingResponse({ bookId, editionId, processing: state }, bookId, editionId), state);
});

test('processing parser rejects malformed, contradictory, and cross-edition responses', () => {
  const invalidResponses = [
    null,
    { bookId: 'another-book', editionId, processing: state },
    { bookId, editionId: 'another-edition', processing: state },
    { bookId, editionId, processing: { ...state, generation: -1 } },
    {
      bookId,
      editionId,
      processing: {
        ...state,
        summary: { ...state.summary, averageConfidence: null, method: 'ocr' },
      },
    },
    {
      bookId,
      editionId,
      processing: {
        ...state,
        summary: { ...state.summary, lowConfidencePageCount: 11 },
      },
    },
  ];
  for (const response of invalidResponses) {
    assert.throws(
      () => parseEditionProcessingResponse(response, bookId, editionId),
      BooksApiError,
    );
  }
});

test('approval parser requires the real ready edition, processing, identity, and request contract', () => {
  const payload = { bookId, editionId, edition: approvedEdition, processing: approvedState, requestId };
  assert.deepEqual(parseEditionProcessingApprovalResponse(payload, bookId, editionId), {
    edition: approvedEdition,
    processing: approvedState,
  });

  const invalidResponses = [
    { ...payload, requestId: 'not-a-uuid' },
    { ...payload, edition: undefined },
    { ...payload, edition: { ...approvedEdition, bookId: 'another-book' } },
    { ...payload, edition: { ...approvedEdition, id: 'another-edition' } },
    { ...payload, edition: { ...approvedEdition, status: 'processing' } },
    { ...payload, processing: state },
  ];
  for (const response of invalidResponses) {
    assert.throws(
      () => parseEditionProcessingApprovalResponse(response, bookId, editionId),
      BooksApiError,
    );
  }
});

test('processing actions are deny-by-default while busy and lock published editions', () => {
  assert.deepEqual(availableProcessingActions('processing', 'review_required'), ['approve', 'reprocess']);
  assert.deepEqual(availableProcessingActions('ready', 'review_required'), ['reprocess']);
  assert.deepEqual(availableProcessingActions('draft', 'failed'), []);
  assert.deepEqual(availableProcessingActions('archived', 'ready'), []);
  assert.deepEqual(availableProcessingActions('ready', 'processing'), []);
  for (const status of ['ready', 'ocr_required', 'processing', 'review_required', 'failed'] as const) {
    assert.deepEqual(availableProcessingActions('published', status), []);
  }
});

test('processing state preserves clear action failures and ignores stale request identities', () => {
  let entries = processingPageLoading([editionId]);
  assert.equal(entries[editionId]?.phase, 'loading');
  entries = processingLoadSucceeded(entries, editionId, state);
  entries = processingActionStarted(entries, editionId, 'approve');
  assert.equal(entries[editionId]?.action, 'approve');
  entries = processingActionFailed(entries, editionId, 'approve');
  assert.deepEqual(
    { action: entries[editionId]?.action, error: entries[editionId]?.actionError, status: entries[editionId]?.processing?.summary.status },
    { action: null, error: 'approve', status: 'review_required' },
  );
  entries = processingLoadFailed(entries, editionId);
  assert.equal(entries[editionId]?.phase, 'error');
  assert.equal(entries[editionId]?.processing, state);

  const visible = new Set([editionId]);
  assert.equal(isCurrentEditionProcessingRequest(bookId, bookId, visible, editionId, 8, 8), true);
  assert.equal(isCurrentEditionProcessingRequest('another-book', bookId, visible, editionId, 8, 8), false);
  assert.equal(isCurrentEditionProcessingRequest(bookId, bookId, new Set(), editionId, 8, 8), false);
  assert.equal(isCurrentEditionProcessingRequest(bookId, bookId, visible, editionId, 9, 8), false);
});

test('document references and displayed failure codes are constrained to safe forms', () => {
  assert.equal(documentIdFromReference(`document:${editionId}`), editionId);
  assert.equal(documentIdFromReference(`other:${editionId}`), null);
  assert.equal(documentIdFromReference('document:../source'), null);
  assert.equal(safeDocumentFailureCode('OCR_ENGINE_UNAVAILABLE'), 'OCR_ENGINE_UNAVAILABLE');
  assert.equal(safeDocumentFailureCode('<script>alert(1)</script>'), null);
  assert.equal(safeDocumentFailureCode('a'.repeat(81)), null);
});

test('processing client uses canonical encoded load, reprocess, and approve routes', async () => {
  const calls: Array<{ body: string | null; contentType: string | null; method: string; url: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      body: typeof init?.body === 'string' ? init.body : null,
      contentType: new Headers(init?.headers).get('Content-Type'),
      method: init?.method ?? 'GET',
      url: String(input),
    });
    const approval = String(input).endsWith('/approve');
    return Response.json({
      bookId: 'book/id',
      editionId: 'edition/id',
      ...(approval ? {
        edition: { ...approvedEdition, bookId: 'book/id', id: 'edition/id' },
        processing: approvedState,
        requestId,
      } : { processing: state }),
    });
  };
  try {
    await fetchEditionProcessing('book/id', 'edition/id');
    await reprocessEdition('book/id', 'edition/id');
    const approved = await approveEditionProcessing('book/id', 'edition/id');
    assert.equal(approved.edition.status, 'ready');
    assert.equal(approved.processing.summary.status, 'ready');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls, [
    { body: null, contentType: null, method: 'GET', url: '/api/internal/books/book%2Fid/editions/edition%2Fid/processing' },
    { body: null, contentType: null, method: 'POST', url: '/api/internal/books/book%2Fid/editions/edition%2Fid/processing' },
    {
      body: null,
      contentType: null,
      method: 'POST',
      url: '/api/internal/books/book%2Fid/editions/edition%2Fid/processing/approve',
    },
  ]);
});

test('approval request never sends a client-controlled actor identity', async () => {
  const originalFetch = globalThis.fetch;
  let body: BodyInit | null | undefined;
  globalThis.fetch = async (_input, init) => {
    body = init?.body;
    return Response.json({
      bookId,
      edition: approvedEdition,
      editionId,
      processing: approvedState,
      requestId,
    });
  };
  try {
    await approveEditionProcessing(bookId, editionId);
    assert.equal(body, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('processing client preserves stable backend errors without exposing response messages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { code: 'PUBLISHED_EDITION_REPROCESS_FORBIDDEN', message: 'internal detail' },
    { status: 409 },
  );
  try {
    await assert.rejects(() => reprocessEdition(bookId, editionId), (error: unknown) => {
      assert.ok(error instanceof BooksApiError);
      assert.equal(error.code, 'PUBLISHED_EDITION_REPROCESS_FORBIDDEN');
      assert.equal(error.message, 'PUBLISHED_EDITION_REPROCESS_FORBIDDEN');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
