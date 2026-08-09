import assert from 'node:assert/strict';
import test from 'node:test';
import { AnswerRequestService } from '../../answer-request-service.ts';
import type { AnswerInput } from '../../domain.ts';
import type { QuestionLogRecord } from '../../../shared/contracts/question-log.ts';
import { TelegramUpdateHandler } from './handler.ts';
import { TelegramHistory } from './history.ts';
import { TelegramRateLimiter } from './rate-limit.ts';
import { TelegramStore } from './store.ts';
import type { TelegramUpdate } from './types.ts';

const secret = 'test-session-secret-with-32-characters';

test('commands and callbacks select ar/en/sw with inline keyboard and private chats only', async () => {
  const fixture = createFixture();
  try {
    await fixture.handler.handle(messageUpdate(1, 101, '/start'));
    assert.equal(fixture.client.messages.length, 1);
    assert.ok(fixture.client.messages[0]?.markup);

    await fixture.handler.handle(callbackUpdate(2, 101, 'language:ar'));
    assert.equal(fixture.store.getLanguage(fixture.store.sessionKey(101)), 'ar');
    assert.equal(fixture.client.callbacks[0]?.id, 'cb-2');
    assert.match(fixture.client.callbacks[0]?.text ?? '', /العربية/);

    await fixture.handler.handle(messageUpdate(3, 101, '/language'));
    assert.ok(fixture.client.messages.at(-1)?.markup);
    await fixture.handler.handle(callbackUpdate(4, 101, 'language:en'));
    await fixture.handler.handle(callbackUpdate(5, 101, 'language:sw'));
    assert.equal(fixture.store.getLanguage(fixture.store.sessionKey(101)), 'sw');

    const before = fixture.client.messages.length;
    await fixture.handler.handle(messageUpdate(6, -99, 'group question', 'group'));
    assert.equal(fixture.client.messages.length, before);
    assert.equal(fixture.inputs.length, 0);
  } finally {
    fixture.store.close();
  }
});

test('every callback is acknowledged before unsupported callbacks are safely ignored', async () => {
  const fixture = createFixture();
  try {
    await fixture.handler.handle({
      updateId: 1,
      callbackQuery: { data: 'language:en', id: 'without-message' },
    });
    await fixture.handler.handle({
      updateId: 2,
      callbackQuery: {
        data: 'language:en',
        id: 'from-group',
        message: { chat: { id: -22, type: 'group' }, messageId: 2 },
      },
    });
    await fixture.handler.handle(callbackUpdate(3, 22, 'invalid-data'));

    assert.deepEqual(fixture.client.callbacks.map((callback) => callback.id), [
      'without-message', 'from-group', 'cb-3',
    ]);
    assert.equal(fixture.client.messages.length, 0);
    assert.equal(fixture.inputs.length, 0);
  } finally {
    fixture.store.close();
  }
});

test('questions require language, enforce length and rate, and pass short history', async () => {
  const fixture = createFixture({ rateLimit: 2 });
  try {
    await fixture.handler.handle(messageUpdate(1, 22, 'question before language'));
    assert.equal(fixture.inputs.length, 0);
    assert.ok(fixture.client.messages.at(-1)?.markup);

    await fixture.handler.handle(callbackUpdate(2, 22, 'language:en'));
    await fixture.handler.handle(messageUpdate(3, 22, 'x'.repeat(2_001)));
    assert.equal(fixture.inputs.length, 0);
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /too long/);

    await fixture.handler.handle(messageUpdate(4, 22, 'first'));
    await fixture.handler.handle(messageUpdate(5, 22, 'second'));
    await fixture.handler.handle(messageUpdate(6, 22, 'third'));
    assert.equal(fixture.inputs.length, 2);
    assert.deepEqual(fixture.inputs[0]?.history, []);
    assert.deepEqual(fixture.inputs[1]?.history.map((turn) => turn.content), ['first', 'answer:first']);
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /temporary question limit/);
    assert.equal(fixture.channels.every((channel) => channel === 'telegram'), true);
  } finally {
    fixture.store.close();
  }
});

test('long answers split safely and service failures expose only translated safe errors', async () => {
  const longAnswer = `${'a'.repeat(3_000)}\n\n${'😀'.repeat(1_000)}`;
  const fixture = createFixture({ answer: longAnswer });
  try {
    await fixture.handler.handle(callbackUpdate(1, 44, 'language:en'));
    const before = fixture.client.messages.length;
    await fixture.handler.handle(messageUpdate(2, 44, 'long answer'));
    const chunks = fixture.client.messages.slice(before).map((entry) => entry.text);
    assert.equal(chunks.join(''), longAnswer);
    assert.ok(chunks.every((chunk) => chunk.length <= 4_096));

    fixture.failWith = new Error('token=secret https://api.telegram.org/botsecret');
    await fixture.handler.handle(messageUpdate(3, 44, 'failure'));
    const safe = fixture.client.messages.at(-1)?.text ?? '';
    assert.match(safe, /could not be completed/);
    assert.doesNotMatch(safe, /secret|telegram\.org/);
  } finally {
    fixture.store.close();
  }
});

test('sendChatAction is best-effort and its failure does not block the answer', async () => {
  const fixture = createFixture();
  try {
    await fixture.handler.handle(callbackUpdate(1, 77, 'language:en'));
    fixture.client.chatActionFailure = new Error('typing unavailable');
    await fixture.handler.handle(messageUpdate(2, 77, 'still answer'));

    assert.equal(fixture.inputs.length, 1);
    assert.equal(fixture.client.messages.at(-1)?.text, 'answer:still answer');
  } finally {
    fixture.store.close();
  }
});

test('integration records a handled question with channel=telegram', async () => {
  const records: QuestionLogRecord[] = [];
  const requestService = new AnswerRequestService({
    answerWithContext: async () => ({
      evidenceReferences: ['book:1'],
      result: { answer: 'grounded', grounded: true },
    }),
  }, {
    record: async (record) => { records.push(record); return true; },
  });
  const fixture = createFixture({ answers: requestService });
  try {
    await fixture.handler.handle(callbackUpdate(1, 55, 'language:en'));
    await fixture.handler.handle(messageUpdate(2, 55, 'What is taught?'));
    assert.equal(records.length, 1);
    assert.equal(records[0]?.channel, 'telegram');
    assert.equal(records[0]?.question, 'What is taught?');
  } finally {
    fixture.store.close();
  }
});

function createFixture(options: {
  answer?: string;
  answers?: { answer(input: AnswerInput, channel: 'telegram'): Promise<{ answer: string; grounded: boolean; requestId: string }> };
  rateLimit?: number;
} = {}) {
  const inputs: AnswerInput[] = [];
  const channels: string[] = [];
  let failWith: Error | undefined;
  const answers = options.answers ?? {
    async answer(input: AnswerInput, channel: 'telegram') {
      inputs.push(input);
      channels.push(channel);
      if (failWith) throw failWith;
      return { answer: options.answer ?? `answer:${input.question}`, grounded: true, requestId: 'request' };
    },
  };
  const client = {
    callbacks: [] as Array<{ id: string; text?: string }>,
    chatActionFailure: undefined as Error | undefined,
    messages: [] as Array<{ chatId: number; markup?: unknown; text: string }>,
    typing: [] as number[],
    async answerCallbackQuery(id: string, text?: string) { this.callbacks.push({ id, text }); },
    async sendChatAction(chatId: number) {
      this.typing.push(chatId);
      if (this.chatActionFailure) throw this.chatActionFailure;
    },
    async sendMessage(chatId: number, text: string, markup?: unknown) {
      this.messages.push({ chatId, markup, text });
    },
  };
  const store = new TelegramStore(':memory:', secret);
  const handler = new TelegramUpdateHandler(
    answers,
    client,
    store,
    new TelegramHistory(60_000),
    new TelegramRateLimiter(options.rateLimit ?? 5, 60_000),
  );
  return {
    channels,
    client,
    get failWith() { return failWith; },
    set failWith(error: Error | undefined) { failWith = error; },
    handler,
    inputs,
    store,
  };
}

function messageUpdate(
  updateId: number,
  chatId: number,
  text: string,
  type: 'private' | 'group' = 'private',
): TelegramUpdate {
  return { updateId, message: { chat: { id: chatId, type }, messageId: updateId, text } };
}

function callbackUpdate(updateId: number, chatId: number, data: string): TelegramUpdate {
  return {
    updateId,
    callbackQuery: {
      data,
      id: `cb-${updateId}`,
      message: { chat: { id: chatId, type: 'private' }, messageId: updateId },
    },
  };
}
