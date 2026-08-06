import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDecisionCanBeSaved,
  assertReviewStatusTransition,
  InvalidReviewTransitionError,
} from './review-domain.ts';

test('review state policy permits claims, releases, and decisions only before a terminal state', () => {
  assert.doesNotThrow(() => assertReviewStatusTransition('pending', 'in_review'));
  assert.doesNotThrow(() => assertReviewStatusTransition('in_review', 'pending'));
  assert.doesNotThrow(() => assertDecisionCanBeSaved('pending'));
  assert.doesNotThrow(() => assertDecisionCanBeSaved('in_review'));

  assert.throws(
    () => assertReviewStatusTransition('approved', 'in_review'),
    InvalidReviewTransitionError,
  );
  assert.throws(() => assertReviewStatusTransition('pending', 'approved'), InvalidReviewTransitionError);
  assert.throws(() => assertDecisionCanBeSaved('rejected'), InvalidReviewTransitionError);
  assert.throws(() => assertDecisionCanBeSaved('needs_changes'), InvalidReviewTransitionError);
});
