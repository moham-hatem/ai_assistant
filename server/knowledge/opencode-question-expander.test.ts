import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CachedQuestionExpander } from './cached-question-expander.ts';
import { OpenCodeQuestionExpander, parseAlternatives } from './opencode-question-expander.ts';
import { QuestionExpansionCache } from './question-expansion-cache.ts';

test('parses bounded multilingual search alternatives', () => {
  const alternatives = parseAlternatives(
    '```json\n["major ritual impurity", "hadathi kubwa", "الحدث الأكبر"]\n```',
    'ما الحدث الأكبر؟',
  );

  assert.deepEqual(alternatives, ['major ritual impurity', 'hadathi kubwa', 'الحدث الأكبر']);
});

test('rejects mixed-script and intent-changing alternatives', () => {
  const alternatives = parseAlternatives(
    '["causes of ritual impurity", "hadathi kubwa na hadathi ndogo", "الحدث الأكبر والحدث الأصغر", "دifference between major and minor impurity"]',
    'difference between major and minor ritual impurity',
  );

  assert.deepEqual(alternatives, ['hadathi kubwa na hadathi ndogo', 'الحدث الأكبر والحدث الأصغر']);
});

test('rejects expansions that omit a Kiswahili retrieval phrase', () => {
  assert.throws(() => parseAlternatives(
    '["importance of seeking religious knowledge", "أهمية طلب العلم الشرعي"]',
    'لماذا يستمر المسلم في تعلم دينه؟',
  ), /Kiswahili/);
});

test('OpenCode question expansions are cached locally', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'question-expansion-test-'));
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: '["major ritual impurity", "hadathi kubwa", "الحدث الأكبر"]' } }],
    }), { status: 200 });
  }) as typeof fetch;
  const expander = new CachedQuestionExpander(
    new OpenCodeQuestionExpander({
      apiKey: 'test-key',
      endpoint: 'https://example.test/chat',
      fetcher,
      model: 'test-model',
      timeoutMs: 5_000,
    }),
    new QuestionExpansionCache(join(directory, 'expansions.json')),
  );

  try {
    const first = await expander.expand('ما الفرق بين الحدث الأكبر والأصغر؟');
    const second = await expander.expand('ما الفرق بين الحدث الأكبر والأصغر؟');
    assert.deepEqual(second, first);
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('OpenCode question expansion tries fallback models after an empty primary response', async () => {
  const requestedModels: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    requestedModels.push(body.model);
    const content = body.model === 'primary' ? '' : '["hadathi kubwa", "major ritual impurity"]';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  const expander = new OpenCodeQuestionExpander({
    apiKey: 'test',
    endpoint: 'https://example.test',
    fallbackModels: ['backup'],
    fetcher,
    model: 'primary',
    timeoutMs: 3_000,
  });

  const alternatives = await expander.expand('ما الحدث الأكبر؟');

  assert.deepEqual(alternatives, ['hadathi kubwa', 'major ritual impurity']);
  assert.deepEqual(requestedModels, ['primary', 'backup']);
});
