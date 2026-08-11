import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramHttpClient } from './client.ts';
import { createTelegramConfig } from './config.ts';
import { classifyTelegramFailure, TelegramApiError } from './errors.ts';
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
    TELEGRAM_UPDATE_LEASE_MS: '9999999',
  }, '/app');

  assert.equal(config.botToken, 'fake-token');
  assert.equal(config.pollTimeoutSeconds, 30);
  assert.equal(config.httpTimeoutMs, 120_000);
  assert.equal(config.modelTimeoutMs, 15_000);
  assert.equal(config.retryDelayMs, 50);
  assert.equal(config.rateLimitCount, 100);
  assert.equal(config.rateLimitWindowMs, 60_000);
  assert.equal(config.historyTtlMs, 60_000);
  assert.equal(config.processingDeadlineMs, 130_000);
  assert.equal(config.updateLeaseMs, 15 * 60_000);
  assert.match(config.databaseFile, /data[\\/]telegram\.sqlite$/);
});

test('Telegram uses a short bounded model timeout independently from the website', () => {
  const required = {
    TELEGRAM_BOT_TOKEN: 'fake',
    TELEGRAM_SESSION_SECRET: secret,
  };
  assert.equal(createTelegramConfig(required, '/app').modelTimeoutMs, 15_000);
  assert.equal(createTelegramConfig({
    ...required,
    TELEGRAM_MODEL_TIMEOUT_MS: '999999',
  }, '/app').modelTimeoutMs, 60_000);
  assert.equal(createTelegramConfig({
    ...required,
    TELEGRAM_MODEL_TIMEOUT_MS: '1',
  }, '/app').modelTimeoutMs, 5_000);
});

test('Telegram config rejects timing combinations that guarantee timeout or lease expiry', () => {
  const required = {
    TELEGRAM_BOT_TOKEN: 'fake',
    TELEGRAM_SESSION_SECRET: secret,
  };
  assert.throws(() => createTelegramConfig({
    ...required,
    TELEGRAM_HTTP_TIMEOUT_MS: '35000',
    TELEGRAM_POLL_TIMEOUT_SECONDS: '30',
  }, '/app'), /HTTP_TIMEOUT_MS/u);
  assert.throws(() => createTelegramConfig({
    ...required,
    TELEGRAM_PROCESSING_DEADLINE_MS: '90000',
    TELEGRAM_UPDATE_LEASE_MS: '95000',
  }, '/app'), /UPDATE_LEASE_MS/u);

  const valid = createTelegramConfig({
    ...required,
    TELEGRAM_HTTP_TIMEOUT_MS: '35001',
    TELEGRAM_POLL_TIMEOUT_SECONDS: '30',
    TELEGRAM_PROCESSING_DEADLINE_MS: '90000',
    TELEGRAM_UPDATE_LEASE_MS: '95001',
  }, '/app');
  assert.equal(valid.httpTimeoutMs, 35_001);
  assert.equal(valid.updateLeaseMs, 95_001);
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
      : url.endsWith('getMe')
        ? { first_name: 'Daleel', id: 42, is_bot: true, username: 'DaleelBot' }
      : url.endsWith('sendMessage') || url.endsWith('editMessageText')
        ? { message_id: 99 }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  const client = new TelegramHttpClient('123:fake', 1_000, fakeFetch);

  assert.deepEqual(await client.getUpdates(5, 30), [{ updateId: 1 }]);
  assert.equal(await client.sendMessage(7, 'answer', { inline_keyboard: [] }), 99);
  await client.editMessageText(7, 99, 'final answer');
  await client.sendChatAction(7);
  await client.answerCallbackQuery('callback', 'done');
  assert.equal((await client.getMe()).link, 'https://t.me/DaleelBot');
  await client.setMyCommands([{ command: 'help', description: 'Show help' }], 'en');

  assert.deepEqual(calls.map((call) => call.url.split('/').at(-1)), [
    'getUpdates', 'sendMessage', 'editMessageText', 'sendChatAction', 'answerCallbackQuery', 'getMe', 'setMyCommands',
  ]);
  assert.deepEqual(calls[0]?.body, {
    allowed_updates: ['message', 'callback_query'], offset: 5, timeout: 30,
  });
  assert.equal(calls[1]?.body.chat_id, 7);
  assert.equal(calls[2]?.body.message_id, 99);
  assert.equal(calls[3]?.body.action, 'typing');
  assert.equal(calls[4]?.body.callback_query_id, 'callback');
  assert.deepEqual(calls[6]?.body, {
    commands: [{ command: 'help', description: 'Show help' }],
    language_code: 'en',
  });
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
    async () => { throw new Error(`Telegram API forged ${token} ${url}`); },
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
  await assert.rejects(client.editMessageText(1, 1, 'text'), /editMessageText returned an invalid response/);
  await assert.rejects(client.sendChatAction(1), /sendChatAction returned an invalid response/);
  await assert.rejects(client.answerCallbackQuery('id'), /answerCallbackQuery returned an invalid response/);
  await assert.rejects(client.getMe(), /invalid bot identity/);
  await assert.rejects(
    client.setMyCommands([{ command: 'help', description: 'Show help' }]),
    /setMyCommands returned an invalid response/,
  );
  await assert.rejects(
    client.setMyCommands([{ command: 'help', description: 'line one\nline two' }]),
    /Invalid Telegram commands/,
  );
});

test('HTTP status failures use typed sanitized retry decisions', async () => {
  for (const [status, code, disposition] of [
    [401, 'authentication_failed', 'fatal'],
    [409, 'conflict', 'fatal'],
    [429, 'rate_limited', 'transient'],
    [503, 'service_unavailable', 'transient'],
  ] as const) {
    const client = new TelegramHttpClient('999:private', 1_000, async () => new Response('', { status }));
    await assert.rejects(client.getUpdates(undefined, 1), (error: unknown) => {
      assert.ok(error instanceof TelegramApiError);
      assert.equal(error.code, code);
      assert.equal(classifyTelegramFailure(error), disposition);
      assert.doesNotMatch(error.message, /999:private/u);
      return true;
    });
  }
});
