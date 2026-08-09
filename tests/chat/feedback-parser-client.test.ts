import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFeedbackResponse, FeedbackResponseParseError } from '../../src/features/chat/feedback/api/feedback-parser.ts';
import { FeedbackApiError, submitFeedback } from '../../src/features/chat/feedback/api/submit-feedback.ts';
import type { FeedbackRequest } from '../../src/features/chat/feedback/types.ts';

const acceptedResponse = {
  feedback: { id: 'feedback-1', rating: 'unhelpful' },
  requestId: 'request-1',
  review: { created: true, reviewId: 'review-secret' },
};

test('feedback parser accepts both review outcomes and enforces their invariant', () => {
  assert.deepEqual(parseFeedbackResponse(acceptedResponse), acceptedResponse);
  assert.deepEqual(parseFeedbackResponse({
    feedback: { id: 'feedback-2' },
    requestId: 'request-2',
    review: { created: false, reviewId: null },
  }).review, { created: false, reviewId: null });
  assert.deepEqual(parseFeedbackResponse({
    feedback: { id: 'feedback-3' },
    requestId: 'request-3',
    review: { created: false, reviewId: 'existing-review' },
  }).review, { created: false, reviewId: 'existing-review' });

  for (const payload of [
    null,
    [],
    { ...acceptedResponse, requestId: ' ' },
    { ...acceptedResponse, extra: true },
    { ...acceptedResponse, feedback: [] },
    { ...acceptedResponse, feedback: {} },
    { ...acceptedResponse, review: { created: true, reviewId: null } },
    { ...acceptedResponse, review: { created: false, reviewId: ' ' } },
    { ...acceptedResponse, review: { created: false, reviewId: null, secret: true } },
  ]) {
    assert.throws(() => parseFeedbackResponse(payload), FeedbackResponseParseError);
  }
});

test('typed feedback client posts the exact privacy-limited request', async () => {
  const originalFetch = globalThis.fetch;
  let captured: { body?: string; headers?: HeadersInit; method?: string; url?: string } = {};
  globalThis.fetch = async (input, init) => {
    captured = {
      body: typeof init?.body === 'string' ? init.body : undefined,
      headers: init?.headers,
      method: init?.method,
      url: String(input),
    };
    return Response.json(acceptedResponse);
  };
  const request: FeedbackRequest = {
    comment: 'The citation is unrelated.',
    questionLogId: 'question-log-1',
    rating: 'unhelpful',
    reasons: ['irrelevant_evidence'],
    submissionId: 'submission-1',
  };

  try {
    assert.deepEqual(await submitFeedback(request), acceptedResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(captured.url, '/api/feedback');
  assert.equal(captured.method, 'POST');
  assert.deepEqual(captured.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(captured.body ?? '{}'), request);
  assert.deepEqual(Object.keys(JSON.parse(captured.body ?? '{}')).sort(), [
    'comment', 'questionLogId', 'rating', 'reasons', 'submissionId',
  ]);
  assert.equal(captured.body?.includes('answer'), false);
  assert.equal(captured.body?.includes('history'), false);
});

test('feedback client classifies failures without exposing raw server messages', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'database stack secret' }), { status: 500 });
    await assert.rejects(() => submitFeedback(helpfulRequest()), (error: unknown) => {
      return error instanceof FeedbackApiError
        && error.code === 'submission_failed'
        && !error.message.includes('database');
    });

    globalThis.fetch = async () => new Response('{bad json', { status: 200 });
    await assert.rejects(() => submitFeedback(helpfulRequest()), errorWithCode('invalid_response'));

    globalThis.fetch = async () => { throw new Error('network details'); };
    await assert.rejects(() => submitFeedback(helpfulRequest()), errorWithCode('unavailable'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function helpfulRequest(): FeedbackRequest {
  return {
    questionLogId: 'question-log-1',
    rating: 'helpful',
    reasons: [],
    submissionId: 'submission-1',
  };
}

function errorWithCode(code: FeedbackApiError['code']) {
  return (error: unknown) => error instanceof FeedbackApiError && error.code === code;
}
