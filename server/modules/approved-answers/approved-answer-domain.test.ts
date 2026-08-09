import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApprovedQuestion } from './approved-answer-domain.ts';

test('approved question normalization is deterministic and conservative', () => {
  assert.equal(
    normalizeApprovedQuestion('  WHAT\t is Wudu?!  '),
    normalizeApprovedQuestion('what is wudu'),
  );
  assert.equal(
    normalizeApprovedQuestion('مَا هُوَ الوُضُوء؟'),
    normalizeApprovedQuestion('ما هو الوضوء'),
  );
  assert.notEqual(
    normalizeApprovedQuestion('what is wudu'),
    normalizeApprovedQuestion('what is ritual wudu'),
  );
});
