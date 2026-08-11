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
import type { TelegramAccessPolicy } from './access-policy.ts';

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
    assert.equal(fixture.client.messages.length, before + 1);
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /private chat/);
    assert.equal(fixture.inputs.length, 0);
  } finally {
    fixture.store.close();
  }
});

test('closed beta requires a valid start payload before any private interaction', async () => {
  let authorized = false;
  const payloads: Array<string | undefined> = [];
  const accessPolicy: TelegramAccessPolicy = {
    authorize(_sessionKey, payload) {
      payloads.push(payload);
      if (payload === 'invite_code_123456') {
        authorized = true;
        return 'paired';
      }
      return authorized ? 'authorized' : 'denied';
    },
    isAuthorized: () => authorized,
  };
  const fixture = createFixture({ accessPolicy });
  try {
    await fixture.handler.handle(messageUpdate(1, 101, '/help'));
    await fixture.handler.handle(messageUpdate(2, 101, 'private question'));
    await fixture.handler.handle(callbackUpdate(3, 101, 'language:ar'));
    assert.equal(fixture.inputs.length, 0);
    assert.equal(fixture.store.getLanguage(fixture.store.sessionKey(101)), undefined);
    assert.match(fixture.client.messages[0]?.text ?? '', /Closed beta/);
    assert.match(fixture.client.callbacks[0]?.text ?? '', /Closed beta/);

    await fixture.handler.handle(messageUpdate(4, 101, '/start invite_code_123456'));
    assert.equal(payloads.at(-1), 'invite_code_123456');
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /Choose the answer language/);
  } finally {
    fixture.store.close();
  }
});

test('help, privacy, reset, unknown commands, and non-text feedback are safe', async () => {
  const fixture = createFixture();
  try {
    await fixture.handler.handle(messageUpdate(1, 31, '/start'));
    const prompt = fixture.client.messages.at(-1)?.text ?? '';
    assert.match(prompt, /اختر لغة الإجابة/);
    assert.match(prompt, /Choose the answer language/);
    assert.match(prompt, /Chagua lugha ya jibu/);

    await fixture.handler.handle(callbackUpdate(2, 31, 'language:en'));
    await fixture.handler.handle(messageUpdate(3, 31, '/help'));
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /\/privacy privacy information/);
    await fixture.handler.handle(messageUpdate(4, 31, '/privacy'));
    const privacy = fixture.client.messages.at(-1)?.text ?? '';
    assert.match(privacy, /does not store your message text/);
    assert.match(privacy, /central question log stores the question, outcome/);

    await fixture.handler.handle(messageUpdate(5, 31, 'first question'));
    await fixture.handler.handle(messageUpdate(6, 31, '/reset'));
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /temporary conversation context was cleared/);
    await fixture.handler.handle(messageUpdate(7, 31, 'second question'));
    assert.deepEqual(fixture.inputs.at(-1)?.history, []);

    const answered = fixture.inputs.length;
    await fixture.handler.handle(messageUpdate(8, 31, '/not-a-command'));
    assert.equal(fixture.inputs.length, answered);
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /not recognized/);
    await fixture.handler.handle(nonTextUpdate(9, 31));
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /Images, files, and voice/);
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

test('an expired callback acknowledgement does not stop language selection', async () => {
  const fixture = createFixture();
  try {
    fixture.client.callbackFailure = new Error('callback query is too old');
    await fixture.handler.handle(callbackUpdate(1, 22, 'language:ar'));

    assert.equal(fixture.store.getLanguage(fixture.store.sessionKey(22)), 'ar');
    assert.match(fixture.client.messages.at(-1)?.text ?? '', /تم اختيار العربية/);
    assert.deepEqual(fixture.client.callbacks.map((callback) => callback.id), ['cb-1']);
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
    assert.equal(fixture.client.edits[0]?.messageId, fixture.client.messages[before]?.messageId);

    fixture.failWith = new Error('token=secret https://api.telegram.org/botsecret');
    await fixture.handler.handle(messageUpdate(3, 44, 'failure'));
    const safe = fixture.client.messages.at(-1)?.text ?? '';
    assert.match(safe, /could not be completed/);
    assert.doesNotMatch(safe, /secret|telegram\.org/);
  } finally {
    fixture.store.close();
  }
});

test('questions acknowledge processing and return a translated deadline message', async () => {
  const fixture = createFixture({
    answerTimeoutMs: 5,
    answers: {
      answer: async () => new Promise(() => undefined),
    },
  });
  try {
    await fixture.handler.handle(callbackUpdate(1, 88, 'language:ar'));
    const before = fixture.client.messages.length;
    await fixture.handler.handle(messageUpdate(2, 88, 'سؤال بطيء'));

    assert.equal(fixture.client.messages.length, before + 1);
    assert.match(fixture.client.messages[before]?.text ?? '', /وقتًا أطول من المتوقع/);
    assert.equal(fixture.client.edits.at(-1)?.messageId, fixture.client.messages[before]?.messageId);
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
  accessPolicy?: TelegramAccessPolicy;
  answerTimeoutMs?: number;
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
    callbackFailure: undefined as Error | undefined,
    callbacks: [] as Array<{ id: string; text?: string }>,
    chatActionFailure: undefined as Error | undefined,
    edits: [] as Array<{ chatId: number; messageId: number; text: string }>,
    messages: [] as Array<{ chatId: number; markup?: unknown; messageId: number; text: string }>,
    nextMessageId: 1,
    typing: [] as number[],
    async answerCallbackQuery(id: string, text?: string) {
      this.callbacks.push({ id, text });
      if (this.callbackFailure) throw this.callbackFailure;
    },
    async sendChatAction(chatId: number) {
      this.typing.push(chatId);
      if (this.chatActionFailure) throw this.chatActionFailure;
    },
    async editMessageText(chatId: number, messageId: number, text: string) {
      this.edits.push({ chatId, messageId, text });
      const message = this.messages.find((item) => item.chatId === chatId && item.messageId === messageId);
      if (!message) throw new Error('message missing');
      message.text = text;
    },
    async sendMessage(chatId: number, text: string, markup?: unknown) {
      const messageId = this.nextMessageId;
      this.nextMessageId += 1;
      this.messages.push({ chatId, markup, messageId, text });
      return messageId;
    },
  };
  const store = new TelegramStore(':memory:', secret);
  const accessPolicy: TelegramAccessPolicy = options.accessPolicy ?? {
    authorize: () => 'authorized',
    isAuthorized: () => true,
  };
  const handler = new TelegramUpdateHandler(
    answers,
    client,
    store,
    new TelegramHistory(60_000),
    new TelegramRateLimiter(options.rateLimit ?? 5, 60_000),
    accessPolicy,
    options.answerTimeoutMs,
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

function nonTextUpdate(updateId: number, chatId: number): TelegramUpdate {
  return {
    updateId,
    message: { chat: { id: chatId, type: 'private' }, messageId: updateId },
  };
}
