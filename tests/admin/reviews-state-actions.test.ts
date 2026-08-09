import assert from 'node:assert/strict';
import test from 'node:test';
import { createActionLock } from '../../src/features/admin/reviews/action-lock.ts';
import {
  buildDecisionRequest,
  ReviewActionValidationError,
} from '../../src/features/admin/reviews/review-actions.ts';
import { canApproveAsIs } from '../../src/features/admin/reviews/review-action-availability.ts';
import {
  createReviewWorkspaceState,
  reviewWorkspaceReducer,
} from '../../src/features/admin/reviews/reviews-state.ts';
import { reviewDetail, reviewItem, reviewPage } from './reviews-fixtures.ts';

test('decision builders follow server field invariants and omit empty optional fields', () => {
  assert.deepEqual(buildDecisionRequest({
    correctedAnswer: 'ignored', internalNotes: '  ', mode: 'approve_as_is',
  }), { outcome: 'approved' });

  assert.deepEqual(buildDecisionRequest({
    correctedAnswer: ' Corrected wording. ', internalNotes: ' Note. ', mode: 'approve_edited',
  }), {
    correctedAnswer: 'Corrected wording.',
    internalNotes: 'Note.',
    outcome: 'approved',
  });

  assert.deepEqual(buildDecisionRequest({
    correctedAnswer: 'ignored', internalNotes: '', mode: 'reject',
  }), { outcome: 'rejected' });

  assert.deepEqual(buildDecisionRequest({
    correctedAnswer: 'ignored', internalNotes: 'Update the underlying lesson.', mode: 'needs_changes',
  }), { internalNotes: 'Update the underlying lesson.', outcome: 'needs_changes' });
});

test('decision builders reject missing, oversized, and byte-heavy fields', () => {
  assertValidation('correction_required', () => buildDecisionRequest({ correctedAnswer: ' ', internalNotes: '', mode: 'approve_edited' }));
  assertValidation('notes_required', () => buildDecisionRequest({ correctedAnswer: '', internalNotes: ' ', mode: 'needs_changes' }));
  assertValidation('notes_too_long', () => buildDecisionRequest({ correctedAnswer: '', internalNotes: 'x'.repeat(4_001), mode: 'needs_changes' }));
  assertValidation('request_too_large', () => buildDecisionRequest({ correctedAnswer: 'م'.repeat(8_200), internalNotes: '', mode: 'approve_edited' }));
});

test('as-is approval requires an original answer while edited approval remains independent', () => {
  assert.equal(canApproveAsIs('Original grounded answer.'), true);
  assert.equal(canApproveAsIs(null), false);
  assert.equal(canApproveAsIs('   '), false);

  assert.doesNotThrow(() => buildDecisionRequest({
    correctedAnswer: 'Teacher-supplied corrected answer.',
    internalNotes: '',
    mode: 'approve_edited',
  }));
});

test('action lock drops repeated submissions and unlocks after completion', async () => {
  const lock = createActionLock();
  let resolveFirst: ((value: string) => void) | undefined;
  const first = lock.run(() => new Promise<string>((resolve) => { resolveFirst = resolve; }));
  const duplicate = await lock.run(async () => 'duplicate');
  assert.deepEqual(duplicate, { started: false });
  resolveFirst?.('saved');
  assert.deepEqual(await first, { started: true, value: 'saved' });
  assert.deepEqual(await lock.run(async () => 'next'), { started: true, value: 'next' });
});

test('action lock unlocks after a failed request', async () => {
  const lock = createActionLock();
  await assert.rejects(() => lock.run(async () => { throw new Error('failure'); }), /failure/);
  assert.equal(lock.isActive(), false);
  assert.deepEqual(await lock.run(async () => 2), { started: true, value: 2 });
});

test('workspace reducer ignores stale list and detail responses', () => {
  let state = createReviewWorkspaceState();
  state = reviewWorkspaceReducer(state, { type: 'list_started', requestId: 1 });
  state = reviewWorkspaceReducer(state, { type: 'list_started', requestId: 2 });
  state = reviewWorkspaceReducer(state, { type: 'list_succeeded', page: reviewPage, requestId: 1 });
  assert.equal(state.page, null);
  state = reviewWorkspaceReducer(state, { type: 'list_succeeded', page: reviewPage, requestId: 2 });
  assert.equal(state.page?.total, 1);

  state = reviewWorkspaceReducer(state, { type: 'selected', id: reviewItem.id });
  state = reviewWorkspaceReducer(state, { type: 'detail_started', requestId: 3, reviewId: reviewItem.id });
  state = reviewWorkspaceReducer(state, { type: 'selected', id: 'another-review' });
  state = reviewWorkspaceReducer(state, { type: 'detail_succeeded', detail: reviewDetail, requestId: 3, reviewId: reviewItem.id });
  assert.equal(state.detail, null);
});

test('workspace reducer resets navigation and protects a new selection from late mutation data', () => {
  let state = { ...createReviewWorkspaceState(), offset: 20, selectedId: reviewItem.id };
  state = reviewWorkspaceReducer(state, {
    filters: { answerLanguage: 'sw', channel: '', reviewerId: '', status: 'pending' },
    type: 'filters_changed',
  });
  assert.equal(state.offset, 0);
  assert.equal(state.selectedId, null);

  state = reviewWorkspaceReducer(state, { type: 'selected', id: 'new-review' });
  state = reviewWorkspaceReducer(state, {
    detail: reviewDetail,
    kind: 'decision',
    reviewId: reviewItem.id,
    type: 'mutation_succeeded',
  });
  assert.equal(state.detail, null);
  assert.equal(state.successKind, 'decision');
});

test('workspace reducer applies a status response immediately before background resync', () => {
  const claimedItem = { ...reviewItem, assignedReviewerId: 'teacher-a', status: 'in_review' as const };
  let state: ReturnType<typeof createReviewWorkspaceState> = {
    ...createReviewWorkspaceState(),
    detail: reviewDetail,
    detailStatus: 'ready',
    selectedId: reviewItem.id,
  };
  state = reviewWorkspaceReducer(state, {
    item: claimedItem,
    kind: 'claim',
    reviewId: reviewItem.id,
    type: 'mutation_succeeded',
  });
  assert.equal(state.detail?.item.status, 'in_review');
  assert.equal(state.detail?.item.assignedReviewerId, 'teacher-a');
});

function assertValidation(code: string, operation: () => unknown): void {
  assert.throws(operation, (error: unknown) => error instanceof ReviewActionValidationError && error.code === code);
}
