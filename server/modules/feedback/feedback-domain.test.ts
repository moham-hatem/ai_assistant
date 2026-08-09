import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { isHighRiskFeedback } from './feedback-domain.ts';
import { parseSubmitFeedback } from './feedback-input.ts';

test('feedback parser trims optional comments and canonicalizes unique reasons', () => {
  assert.deepEqual(parseSubmitFeedback({
    comment: '  Needs a clearer citation.  ',
    questionLogId: randomUUID(),
    rating: 'unhelpful',
    reasons: ['technical_issue', 'inaccurate'],
    submissionId: randomUUID(),
  }).reasons, ['inaccurate', 'technical_issue']);
  assert.equal(parseSubmitFeedback({
    comment: '   ',
    questionLogId: randomUUID(),
    rating: 'helpful',
    reasons: [],
    submissionId: randomUUID(),
  }).comment, undefined);
});

test('feedback parser enforces rating invariants, uniqueness, fields, ids, and comment limit', () => {
  const base = { questionLogId: randomUUID(), submissionId: randomUUID() };
  assert.throws(() => parseSubmitFeedback({ ...base, rating: 'helpful', reasons: ['unclear'] }));
  assert.throws(() => parseSubmitFeedback({ ...base, rating: 'unhelpful', reasons: [] }));
  assert.throws(() => parseSubmitFeedback({
    ...base, rating: 'unhelpful', reasons: ['unclear', 'unclear'],
  }));
  assert.throws(() => parseSubmitFeedback({
    ...base, rating: 'unhelpful', reasons: ['unknown'],
  }));
  assert.throws(() => parseSubmitFeedback({
    ...base, rating: 'helpful', reasons: [], unexpected: true,
  }));
  assert.throws(() => parseSubmitFeedback({
    ...base, comment: 'x'.repeat(1_001), rating: 'helpful', reasons: [],
  }));
  assert.throws(() => parseSubmitFeedback({
    ...base, questionLogId: 'not-an-id', rating: 'helpful', reasons: [],
  }));
});

test('only harmful or sensitive feedback is high risk', () => {
  assert.equal(isHighRiskFeedback(['harmful_or_sensitive']), true);
  assert.equal(isHighRiskFeedback(['inaccurate', 'unclear']), false);
});
