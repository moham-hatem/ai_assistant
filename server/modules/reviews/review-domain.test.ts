import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDecisionCanBeSaved,
  assertDecisionFields,
  assertReviewStatusTransition,
  InvalidReviewDecisionError,
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

test('review decision policy distinguishes approval edits from content change requests', () => {
  assert.doesNotThrow(() => assertDecisionFields({ outcome: 'approved' }));
  assert.doesNotThrow(() => assertDecisionFields({
    correctedAnswer: 'Edited and approved answer.',
    outcome: 'approved',
  }));
  assert.doesNotThrow(() => assertDecisionFields({ outcome: 'rejected' }));
  assert.doesNotThrow(() => assertDecisionFields({
    internalNotes: 'The underlying content needs correction.',
    outcome: 'needs_changes',
  }));

  assert.throws(
    () => assertDecisionFields({ correctedAnswer: 'No', outcome: 'rejected' }),
    InvalidReviewDecisionError,
  );
  assert.throws(
    () => assertDecisionFields({ correctedAnswer: 'No', outcome: 'needs_changes' }),
    InvalidReviewDecisionError,
  );
  assert.throws(() => assertDecisionFields({ outcome: 'needs_changes' }), InvalidReviewDecisionError);
  assert.throws(
    () => assertDecisionFields({ correctedAnswer: '   ', outcome: 'approved' }),
    InvalidReviewDecisionError,
  );
});
