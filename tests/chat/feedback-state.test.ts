import assert from 'node:assert/strict';
import test from 'node:test';
import { FeedbackApiError } from '../../src/features/chat/feedback/api/submit-feedback.ts';
import { createFeedbackState, feedbackReducer } from '../../src/features/chat/feedback/feedback-state.ts';
import { createFeedbackAttempt } from '../../src/features/chat/feedback/feedback-attempt.ts';
import { createFeedbackSubmission, type FeedbackSubmissionEvent } from '../../src/features/chat/feedback/feedback-submission.ts';
import type { FeedbackRequest, FeedbackResponse } from '../../src/features/chat/feedback/types.ts';
import { buildFeedbackRequest, FeedbackValidationError } from '../../src/features/chat/feedback/validation.ts';

test('validation builds exact helpful and unhelpful payloads', () => {
  assert.deepEqual(buildFeedbackRequest({
    comment: '   ',
    questionLogId: 'question-log-1',
    rating: 'helpful',
    reasons: ['inaccurate'],
    submissionId: 'submission-1',
  }), {
    questionLogId: 'question-log-1',
    rating: 'helpful',
    reasons: [],
    submissionId: 'submission-1',
  });

  assert.deepEqual(buildFeedbackRequest({
    comment: '  Maelezo  ',
    questionLogId: 'question-log-1',
    rating: 'unhelpful',
    reasons: ['unclear', 'unclear', 'wrong_language'],
    submissionId: 'submission-2',
  }), {
    comment: 'Maelezo',
    questionLogId: 'question-log-1',
    rating: 'unhelpful',
    reasons: ['unclear', 'wrong_language'],
    submissionId: 'submission-2',
  });
});

test('validation requires a reason and enforces the 1000 character limit', () => {
  assertValidation('reason_required', () => buildFeedbackRequest({
    comment: '', questionLogId: 'log', rating: 'unhelpful', reasons: [], submissionId: 'submission',
  }));
  assert.doesNotThrow(() => buildFeedbackRequest({
    comment: 'م'.repeat(1_000), questionLogId: 'log', rating: 'unhelpful', reasons: ['inaccurate'], submissionId: 'submission',
  }));
  assertValidation('comment_too_long', () => buildFeedbackRequest({
    comment: 'م'.repeat(1_001), questionLogId: 'log', rating: 'unhelpful', reasons: ['inaccurate'], submissionId: 'submission',
  }));
  assertValidation('invalid_reason', () => buildFeedbackRequest({
    comment: '', questionLogId: 'log', rating: 'unhelpful', reasons: ['unknown' as 'unclear'], submissionId: 'submission',
  }));
});

test('per-message reducers remain independent, terminal success blocks a second rating, and stale events are ignored', () => {
  let first = feedbackReducer(createFeedbackState(), { rating: 'unhelpful', submissionId: 'submission-a', type: 'opened' });
  const second = feedbackReducer(createFeedbackState(), { rating: 'helpful', submissionId: 'submission-b', type: 'opened' });
  first = feedbackReducer(first, { reason: 'unclear', type: 'reason_toggled' });
  assert.deepEqual(first.reasons, ['unclear']);
  assert.deepEqual(second.reasons, []);

  first = feedbackReducer(first, { requestToken: 2, type: 'submit_started' });
  const stale = feedbackReducer(first, { requestToken: 1, reviewRouted: true, type: 'submit_succeeded' });
  assert.equal(stale.phase, 'submitting');
  const succeeded = feedbackReducer(first, { requestToken: 2, reviewRouted: true, type: 'submit_succeeded' });
  assert.equal(succeeded.phase, 'success');
  assert.equal(succeeded.reviewRouted, true);
  assert.equal('reviewId' in succeeded, false);
  assert.strictEqual(
    feedbackReducer(succeeded, { rating: 'helpful', submissionId: 'new-id', type: 'opened' }),
    succeeded,
  );
});

test('an attempt creates one random submissionId and a reset starts a new attempt', () => {
  let generated = 0;
  const attempt = createFeedbackAttempt(() => `random-${++generated}`);
  assert.equal(attempt.open(), 'random-1');
  assert.equal(attempt.open(), null);
  assert.equal(generated, 1);
  attempt.reset();
  assert.equal(attempt.open(), 'random-2');
});

test('submission prevents duplicate clicks and retries the identical snapshot', async () => {
  const events: FeedbackSubmissionEvent[] = [];
  const calls: FeedbackRequest[] = [];
  let call = 0;
  const controller = createFeedbackSubmission((event) => events.push(event), async (request) => {
    calls.push(structuredClone(request));
    call += 1;
    if (call === 1) throw new FeedbackApiError('unavailable');
    return response(false, 'existing-review-id');
  });
  const request = unhelpfulRequest();

  assert.equal(controller.submit(request), true);
  assert.equal(controller.submit({ ...request, submissionId: 'must-not-send' }), false);
  await settle();
  assert.equal(events.at(-1)?.type, 'failed');
  assert.equal(controller.retry(), true);
  await settle();
  assert.deepEqual(calls, [request, request]);
  const finalEvent = events.at(-1);
  assert.equal(finalEvent?.type, 'succeeded');
  assert.equal(finalEvent?.type === 'succeeded' && finalEvent.reviewRouted, true);
  assert.equal(JSON.stringify(events).includes('existing-review-id'), false);
  assert.equal(controller.submit(request), false);
});

test('reset invalidates late success and error completions', async () => {
  const events: FeedbackSubmissionEvent[] = [];
  const success = deferred<FeedbackResponse>();
  const controller = createFeedbackSubmission((event) => events.push(event), () => success.promise);
  controller.submit(unhelpfulRequest());
  controller.reset();
  success.resolve(response(true));
  await settle();
  assert.deepEqual(events.map((event) => event.type), ['started']);

  const failure = deferred<FeedbackResponse>();
  const failureController = createFeedbackSubmission((event) => events.push(event), () => failure.promise);
  failureController.submit(unhelpfulRequest());
  failureController.reset();
  failure.reject(new FeedbackApiError('submission_failed'));
  await settle();
  assert.deepEqual(events.map((event) => event.type), ['started', 'started']);
});

function unhelpfulRequest(): FeedbackRequest {
  return {
    comment: 'Exact retry body',
    questionLogId: 'question-log-1',
    rating: 'unhelpful',
    reasons: ['unclear'],
    submissionId: 'submission-stable',
  };
}

function response(created: boolean, reviewId: string | null = created ? 'hidden-review-id' : null): FeedbackResponse {
  return {
    feedback: {},
    requestId: 'request-1',
    review: { created, reviewId },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function settle() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function assertValidation(code: string, operation: () => unknown) {
  assert.throws(operation, (error: unknown) => error instanceof FeedbackValidationError && error.code === code);
}
