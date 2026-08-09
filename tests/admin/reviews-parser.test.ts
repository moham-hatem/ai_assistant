import assert from 'node:assert/strict';
import test from 'node:test';
import { ReviewsApiError } from '../../src/features/admin/reviews/api/review-api-error.ts';
import {
  parseReviewDetailResponse,
  parseReviewItemResponse,
  parseReviewPage,
} from '../../src/features/admin/reviews/api/review-parser.ts';
import {
  fetchReviewPage,
  saveReviewDecision,
} from '../../src/features/admin/reviews/api/reviews.ts';
import { questionSummary, reviewDetail, reviewItem, reviewPage } from './reviews-fixtures.ts';

test('review parsers accept queue, detail, open channel values, and response metadata', () => {
  const page = parseReviewPage({ ...reviewPage, requestId: 'request-list' });
  assert.deepEqual(page, reviewPage);
  assert.equal(page.items[0]?.questionLog.channel, 'future-channel');
  assert.equal(page.items[0]?.questionLog.answerLanguage, 'en-US');

  const detail = parseReviewDetailResponse({ requestId: 'request-detail', review: reviewDetail });
  assert.deepEqual(detail, reviewDetail);
  assert.equal(detail.questionLog.answer, 'It establishes a deterministic QA statement.');

  assert.deepEqual(
    parseReviewItemResponse({ requestId: 'request-status', review: reviewItem }),
    reviewItem,
  );
});

test('detail parser preserves the backend audit sequence', () => {
  const laterEvent = {
    ...reviewDetail.events[0]!,
    createdAt: '2026-08-08T08:01:00.000Z',
    fromStatus: 'pending' as const,
    id: 'b2c11cb7-f1bd-4450-9ea5-3e0e40cbe59a',
    reviewerId: 'teacher-a',
    toStatus: 'in_review' as const,
    type: 'claimed' as const,
  };
  const detail = parseReviewDetailResponse({
    review: { ...reviewDetail, events: [laterEvent, reviewDetail.events[0]] },
  });
  assert.deepEqual(detail.events.map((event) => event.id), [laterEvent.id, reviewDetail.events[0]!.id]);
});

test('review parsers reject malformed nested contracts', () => {
  assert.throws(
    () => parseReviewPage({ ...reviewPage, items: [{ item: { ...reviewItem, status: 'open' }, questionLog: questionSummary }] }),
    ReviewsApiError,
  );
  assert.throws(
    () => parseReviewDetailResponse({ review: { ...reviewDetail, events: [{ ...reviewDetail.events[0], type: 'deleted' }] } }),
    ReviewsApiError,
  );
  assert.throws(
    () => parseReviewDetailResponse({ review: { ...reviewDetail, questionLog: { ...reviewDetail.questionLog, evidenceReferences: [7] } } }),
    ReviewsApiError,
  );
  assert.throws(
    () => parseReviewDetailResponse({ review: { ...reviewDetail, questionLog: { ...reviewDetail.questionLog, id: 'wrong-log' } } }),
    ReviewsApiError,
  );
  assert.throws(
    () => parseReviewDetailResponse({ review: { ...reviewDetail, questionLog: { ...reviewDetail.questionLog, answer: null } } }),
    ReviewsApiError,
  );
  assert.throws(
    () => parseReviewPage({ ...reviewPage, offset: -1 }),
    ReviewsApiError,
  );
  assert.throws(
    () => parseReviewItemResponse({ review: { ...reviewItem, updatedAt: 'not-a-date' } }),
    ReviewsApiError,
  );
});

test('typed review client encodes exact filters and omits absent decision fields', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body?: string; method?: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      body: typeof init?.body === 'string' ? init.body : undefined,
      method: init?.method,
      url: String(input),
    });
    const payload = calls.length === 1 ? reviewPage : { review: reviewDetail };
    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' }, status: 200 });
  };

  try {
    await fetchReviewPage({
      answerLanguage: 'en-US',
      channel: 'future channel',
      limit: 10,
      offset: 20,
      reviewerId: '',
      status: 'pending',
    });
    await saveReviewDecision(reviewItem.id, { outcome: 'rejected', reviewerId: 'teacher-a' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    calls[0]?.url,
    '/api/internal/reviews?limit=10&offset=20&status=pending&answerLanguage=en-US&channel=future+channel',
  );
  assert.equal(calls[1]?.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1]?.body ?? '{}'), { outcome: 'rejected', reviewerId: 'teacher-a' });
  assert.equal('correctedAnswer' in JSON.parse(calls[1]?.body ?? '{}'), false);
  assert.equal('internalNotes' in JSON.parse(calls[1]?.body ?? '{}'), false);
});

test('typed review client exposes server conflicts without trusting the payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'REVIEW_CONFLICT',
    message: 'The review changed.',
    requestId: 'request-conflict',
  }), { status: 409 });
  try {
    await assert.rejects(
      () => fetchReviewPage({ answerLanguage: '', channel: '', limit: 10, offset: 0, reviewerId: '', status: '' }),
      (error: unknown) => error instanceof ReviewsApiError
        && error.status === 409
        && error.code === 'REVIEW_CONFLICT'
        && error.requestId === 'request-conflict',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
