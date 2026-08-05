import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AnswerModel } from '../domain.ts';
import { AnswerCache } from './answer-cache.ts';
import { CachedAnswerModel } from './cached-answer-model.ts';

test('grounded answers are reused from the persistent local cache', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-cache-test-'));
  let calls = 0;
  const model: AnswerModel = {
    answer: async () => {
      calls += 1;
      return { answer: 'Cached grounded answer', grounded: true };
    },
  };
  const input = { history: [], language: 'en' as const, question: 'What is the lesson?' };
  const evidence = [{ id: 'lesson:1', content: 'Trusted evidence' }];

  try {
    const first = new CachedAnswerModel(
      model,
      new AnswerCache(join(directory, 'answers.json')),
    );
    assert.equal((await first.answer(input, evidence)).answer, 'Cached grounded answer');

    const second = new CachedAnswerModel(
      model,
      new AnswerCache(join(directory, 'answers.json')),
    );
    assert.equal((await second.answer(input, evidence)).answer, 'Cached grounded answer');
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid cached language is removed and regenerated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-cache-language-test-'));
  const path = join(directory, 'answers.json');
  const cache = new AnswerCache(path);
  const input = { history: [], language: 'en' as const, question: 'How do I wash?' };
  const evidence = [{ id: 'lesson:1', content: 'Trusted evidence' }];
  await cache.set(input, evidence, {
    answer: 'The steps are Kuosha viganja viwili vya mikono na kuosha uso wote.',
    grounded: true,
  });
  let calls = 0;
  const model: AnswerModel = {
    answer: async () => {
      calls += 1;
      return { answer: 'Wash both hands and then wash the entire face.', grounded: true };
    },
  };

  try {
    const result = await new CachedAnswerModel(model, cache).answer(input, evidence);
    assert.match(result.answer, /Wash both hands/);
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
