import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors.ts';
import { OpenCodeModel } from './opencode-model.ts';

const input = { history: [], language: 'ar' as const, question: 'سؤال اختباري' };
const evidence = [{ id: 'lesson:1', content: 'دليل موثوق' }];

test('OpenCode falls back when the primary model times out', async () => {
  const calls: string[] = [];
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    calls.push(body.model);
    if (calls.length === 1) throw new DOMException('Timed out', 'TimeoutError');
    return response(200, '<answer>إجابة احتياطية</answer><evidence>1</evidence>');
  }) as typeof fetch;
  const model = createModel(fetcher);

  const result = await model.answer(input, evidence);

  assert.deepEqual(calls, ['primary-free', 'fallback-free']);
  assert.equal(result.answer, 'إجابة احتياطية');
  assert.equal(result.grounded, true);
});

test('OpenCode does not retry an invalid API key', async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return response(401, undefined, 'invalid key');
  }) as typeof fetch;

  await assert.rejects(
    createModel(fetcher).answer(input, evidence),
    (error: unknown) => error instanceof AppError && error.code === 'MODEL_NOT_CONFIGURED',
  );
  assert.equal(calls, 1);
});

test('OpenCode retries the primary model when it returns an empty response', async () => {
  const calls: string[] = [];
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    calls.push(body.model);
    return calls.length === 1
      ? response(200)
      : response(200, '<answer>إجابة بعد رد فارغ</answer><evidence>1</evidence>');
  }) as typeof fetch;

  const result = await createModel(fetcher).answer(input, evidence);

  assert.deepEqual(calls, ['primary-free', 'primary-free']);
  assert.equal(result.answer, 'إجابة بعد رد فارغ');
});

test('OpenCode retries a transient server error before using fallbacks', async () => {
  const calls: string[] = [];
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    calls.push(body.model);
    return calls.length === 1
      ? response(500, undefined, 'temporary failure')
      : response(200, '<answer>إجابة بعد إعادة المحاولة</answer><evidence>1</evidence>');
  }) as typeof fetch;

  const result = await createModel(fetcher).answer(input, evidence);

  assert.deepEqual(calls, ['primary-free', 'primary-free']);
  assert.match(result.answer, /إعادة المحاولة/);
});

test('OpenCode instructs the model to use the selected answer language', async () => {
  let systemPrompt = '';
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    systemPrompt = body.messages[0].content;
    return response(200, '<answer>A grounded answer</answer><evidence>1</evidence>');
  }) as typeof fetch;

  const result = await createModel(fetcher).answer(
    { history: [], language: 'en', question: 'A valid question' },
    evidence,
  );

  assert.match(systemPrompt, /only in English/);
  assert.equal(result.answer, 'A grounded answer');
});

test('OpenCode races multiple fallbacks and accepts the first valid answer', async () => {
  const calls: string[] = [];
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    calls.push(body.model);
    if (body.model === 'good-fallback') {
      return response(200, '<answer>إجابة سليمة</answer><evidence>1</evidence>');
    }
    return response(200);
  }) as typeof fetch;
  const model = new OpenCodeModel({
    apiKey: 'test-key',
    endpoint: 'https://example.test/chat',
    fallbackModels: ['empty-fallback', 'good-fallback'],
    fetcher,
    model: 'primary-free',
    timeoutMs: 5_000,
  });

  const result = await model.answer(input, evidence);

  assert.equal(result.answer, 'إجابة سليمة');
  assert.deepEqual(new Set(calls), new Set(['primary-free', 'empty-fallback', 'good-fallback']));
});

test('OpenCode continues to fallbacks when one model declines the evidence', async () => {
  const calls: string[] = [];
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    calls.push(body.model);
    return body.model === 'primary-free'
      ? response(200, 'INSUFFICIENT')
      : response(200, '<answer>إجابة موثقة من الاحتياطي</answer><evidence>1</evidence>');
  }) as typeof fetch;

  const result = await createModel(fetcher).answer(input, evidence);

  assert.deepEqual(calls, ['primary-free', 'fallback-free']);
  assert.equal(result.answer, 'إجابة موثقة من الاحتياطي');
  assert.equal(result.grounded, true);
});

test('OpenCode rejects a mixed-language answer and uses another model', async () => {
  const calls: string[] = [];
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    calls.push(body.model);
    return body.model === 'primary-free'
      ? response(200, '<answer>The steps are Kuosha viganja viwili vya mikono na kuosha uso wote.</answer><evidence>1</evidence>')
      : response(200, '<answer>Wash both hands and then wash the entire face.</answer><evidence>1</evidence>');
  }) as typeof fetch;

  const result = await createModel(fetcher).answer(
    { history: [], language: 'en', question: 'How do I wash?' },
    evidence,
  );

  assert.deepEqual(calls, ['primary-free', 'fallback-free']);
  assert.match(result.answer, /Wash both hands/);
});

function createModel(fetcher: typeof fetch) {
  return new OpenCodeModel({
    apiKey: 'test-key',
    endpoint: 'https://example.test/chat',
    fallbackModels: ['fallback-free'],
    fetcher,
    model: 'primary-free',
    timeoutMs: 5_000,
  });
}

function response(status: number, content?: string, error?: string) {
  return new Response(JSON.stringify({
    choices: content ? [{ message: { content } }] : undefined,
    error: error ? { message: error } : undefined,
  }), { status });
}
