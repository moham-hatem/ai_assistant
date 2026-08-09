import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { prepareComposerSubmission } from '../../src/features/chat/composer-submission.ts';

test('a blocked composer keeps the complete draft and emits no question', () => {
  assert.deepEqual(prepareComposerSubmission('  سؤال لم يُرسل  ', true), {
    nextDraft: '  سؤال لم يُرسل  ',
    question: null,
  });
});

test('reconnecting allows the same draft to submit and clears it afterwards', () => {
  const draft = '  My saved question  ';
  const blocked = prepareComposerSubmission(draft, true);
  const ready = prepareComposerSubmission(blocked.nextDraft, false);

  assert.deepEqual(ready, { nextDraft: '', question: 'My saved question' });
});

test('the composer keeps its textarea enabled while disabling its submit action', async () => {
  const source = await readFile(`${process.cwd()}/src/features/chat/components/ChatComposer.tsx`, 'utf8');
  assert.doesNotMatch(source, /<textarea[^>]*\bdisabled=/u);
  assert.match(source, /disabled=\{submissionBlockReason !== null \|\| !question\.trim\(\)\}/u);
  assert.match(source, /aria-describedby=\{submissionBlockReason \? 'composer-status'/u);
});
