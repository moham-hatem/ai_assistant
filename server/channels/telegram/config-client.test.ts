import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramHttpClient } from './client.ts';
import { createTelegramConfig } from './config.ts';
import { parseUpdates } from './types.ts';

const secret = 's'.repeat(32);

test('Telegram config requires both isolated secrets and bounds operational values', () => {
  assert.throws(() => createTelegramConfig({}, '/app'), /TELEGRAM_BOT_TOKEN/);
  assert.throws(() => createTelegramConfig({ TELEGRAM_BOT_TOKEN: 'fake' }, '/app'), /SESSION_SECRET/);
  assert.throws(() => createTelegramConfig({
    TELEGRAM_BOT_TOKEN: 'fake',
    TELEGRAM_SESSION_SECRET: 'short',
  }, '/app'), /at least 32/);

  const config = createTelegramConfig({
    TELEGRAM_BOT_TOKEN: ' fake-token ',
    TELEGRAM_HISTORY_TTL_MS: '1',
    TELEGRAM_HTTP_TIMEOUT_MS: '999999',
    TELEGRAM_POLL_TIMEOUT_SECONDS: '5garbage',
    TELEGRAM_RATE_LIMIT_COUNT: '999',
    TELEGRAM_RATE_LIMIT_WINDOW_MS: 'not-a-number',
    TELEGRAM_RETRY_DELAY_MS: '-1',
    TELEGRAM_SESSION_SECRET: secret,
    TELEGRAM_UPDATE_LEASE_MS: '1',
  }, '/app');

  assert.equal(config.botToken, 'fake-token');
  assert.equal(config.pollTimeoutSeconds, 30);
  assert.equal(config.httpTimeoutMs, 120_000);
  assert.equal(config.retryDelayMs, 50);
  assert.equal(config.rateLimitCount, 100);
  assert.equal(config.rateLimitWindowMs, 60_000);
  assert.equal(config.historyTtlMs, 60_000);
  assert.equal(config.updateLeaseMs, 5_000);
  assert.match(config.databaseFile, /data[\\/]telegram\.sqlite$/);
});

test('strict update parser accepts supported shapes and rejects malformed fields', () => {
  assert.deepEqual(parseUpdates([{
    update_id: 7,
    message: { chat: { id: 42, type: 'private' }, message_id: 3, text: 'hello' },
  }]), [{
    updateId: 7,
    message: { chat: { id: 42, type: 'private' }, messageId: 3, text: 'hello' },
  }]);
  assert.throws(() => parseUpdates({}), /getUpdates result/);
  assert.throws(() => parseUpdates([{ update_id: '7' }]), /update_id/);
  assert.throws(() => parseUpdates([{
    update_id: 7,
    message: { chat: { id: 42, type: 'mystery' }, message_id: 3 },
  }]), /chat.type/);
});

test('HTTP client calls all Bot API methods with JSON and parses getUpdates', async () => {
  const calls: Array<{ body: Record<string, unknown>; url: string }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown>, url });
    const result = url.endsWith('getUpdates')
      ? [{ update_id: 1 }]
      : url.endsWith('sendMessage') ? { message_id: 99 } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  const client = new TelegramHttpClient('123:fake', 1_000, fakeFetch);

  assert.deepEqual(await client.getUpdates(5, 30), [{ updateId: 1 }]);
  await client.sendMessage(7, 'answer', { inline_keyboard: [] });
  await client.sendChatAction(7);
  await client.answerCallbackQuery('callback', 'done');

  assert.deepEqual(calls.map((call) => call.url.split('/').at(-1)), [
    'getUpdates', 'sendMessage', 'sendChatAction', 'answerCallbackQuery',
  ]);
  assert.deepEqual(calls[0]?.body, {
    allowed_updates: ['message', 'callback_query'], offset: 5, timeout: 30,
  });
  assert.equal(calls[1]?.body.chat_id, 7);
  assert.equal(calls[2]?.body.action, 'typing');
  assert.equal(calls[3]?.body.callback_query_id, 'callback');
});

test('HTTP failures, invalid responses, and timeouts never expose token or URL', async () => {
  const token = '999:do-not-leak';
  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const cases: Array<typeof fetch> = [
    async () => new Response('upstream secret details', { status: 500 }),
    async () => new Response('{broken', { status: 200 }),
    async () => new Response(JSON.stringify({ ok: false, description: `${token} ${url}` }), { status: 200 }),
    (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error(`${token} ${url}`)));
    }),
  ];
  for (const fakeFetch of cases) {
    const client = new TelegramHttpClient(token, 5, fakeFetch);
    await assert.rejects(client.getUpdates(undefined, 1), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /do-not-leak|api\.telegram\.org/);
      return true;
    });
  }
});

test('HTTP client strictly validates every method result', async () => {
  const invalidFetch: typeof fetch = async () => new Response(
    JSON.stringify({ ok: true, result: false }),
    { status: 200 },
  );
  const client = new TelegramHttpClient('fake-token', 1_000, invalidFetch);
  await assert.rejects(client.getUpdates(undefined, 1), /getUpdates result/);
  await assert.rejects(client.sendMessage(1, 'text'), /sendMessage returned an invalid response/);
  await assert.rejects(client.sendChatAction(1), /sendChatAction returned an invalid response/);
  await assert.rejects(client.answerCallbackQuery('id'), /answerCallbackQuery returned an invalid response/);
});
