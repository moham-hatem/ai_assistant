import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedEditionTransitions, assertEditionTransition } from './book-edition.ts';

test('edition lifecycle exposes the supported forward and recovery transitions', () => {
  assert.deepEqual(allowedEditionTransitions('draft'), ['processing', 'rejected', 'archived']);
  assert.deepEqual(allowedEditionTransitions('processing'), ['ready', 'rejected', 'archived']);
  assert.deepEqual(allowedEditionTransitions('ready'), ['published', 'rejected', 'archived']);
  assert.deepEqual(allowedEditionTransitions('published'), ['archived']);
  assert.deepEqual(allowedEditionTransitions('rejected'), ['draft', 'archived']);
  assert.deepEqual(allowedEditionTransitions('archived'), ['ready']);

  assert.doesNotThrow(() => assertEditionTransition('rejected', 'draft'));
  assert.doesNotThrow(() => assertEditionTransition('archived', 'ready'));
  assert.throws(
    () => assertEditionTransition('draft', 'published'),
    /cannot transition from draft to published/u,
  );
  assert.throws(
    () => assertEditionTransition('archived', 'draft'),
    /cannot transition from archived to draft/u,
  );
  assert.throws(
    () => assertEditionTransition('archived', 'published'),
    /cannot transition from archived to published/u,
  );
});
