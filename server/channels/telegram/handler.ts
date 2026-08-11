import type { AnswerRequestResult } from '../../answer-request-service.ts';
import type { AnswerInput } from '../../domain.ts';
import type { TelegramHttpClient } from './client.ts';
import type { TelegramAccessPolicy } from './access-policy.ts';
import { closedBetaMessage, commandMessage, privateOnlyMessage } from './command-messages.ts';
import { isSupportedCommand, parseTelegramCommand } from './commands.ts';
import { TelegramHistory } from './history.ts';
import {
  languageKeyboard,
  languagePrompt,
  message,
  parseLanguageCallback,
} from './messages.ts';
import { TelegramRateLimiter } from './rate-limit.ts';
import { splitTelegramMessage } from './split-message.ts';
import { TelegramStore } from './store.ts';
import type { TelegramMessage, TelegramUpdate } from './types.ts';

type AnswerRequests = {
  answer(input: AnswerInput, channel: 'telegram'): Promise<AnswerRequestResult>;
};

type TelegramClient = Pick<TelegramHttpClient,
  'answerCallbackQuery' | 'editMessageText' | 'sendChatAction' | 'sendMessage'>;

export class TelegramUpdateHandler {
  private readonly answers: AnswerRequests;
  private readonly accessPolicy: TelegramAccessPolicy;
  private readonly client: TelegramClient;
  private readonly answerTimeoutMs: number;
  private readonly history: TelegramHistory;
  private readonly rateLimiter: TelegramRateLimiter;
  private readonly store: TelegramStore;

  constructor(
    answers: AnswerRequests,
    client: TelegramClient,
    store: TelegramStore,
    history: TelegramHistory,
    rateLimiter: TelegramRateLimiter,
    accessPolicy: TelegramAccessPolicy,
    answerTimeoutMs = 130_000,
  ) {
    if (!Number.isSafeInteger(answerTimeoutMs) || answerTimeoutMs < 1) {
      throw new Error('Telegram answer timeout must be a positive integer');
    }
    this.answers = answers;
    this.answerTimeoutMs = answerTimeoutMs;
    this.client = client;
    this.store = store;
    this.history = history;
    this.rateLimiter = rateLimiter;
    this.accessPolicy = accessPolicy;
  }

  async handle(update: TelegramUpdate, signal?: AbortSignal): Promise<void> {
    if (update.callbackQuery) {
      await this.handleCallback(update.callbackQuery, signal);
      return;
    }
    if (update.message) await this.handleMessage(update.message, signal);
  }

  private async handleMessage(incoming: TelegramMessage, signal?: AbortSignal): Promise<void> {
    if (incoming.chat.type !== 'private') {
      if (incoming.text?.trim()) {
        await this.client.sendMessage(incoming.chat.id, privateOnlyMessage(), undefined, signal);
      }
      return;
    }
    const sessionKey = this.store.sessionKey(incoming.chat.id);
    this.store.ensureSession(sessionKey);
    const language = this.store.getLanguage(sessionKey);
    const currentLanguage = language ?? 'en';
    const text = incoming.text?.trim();
    const command = text ? parseTelegramCommand(text) : undefined;
    const access = this.accessPolicy.authorize(
      sessionKey,
      command?.name === 'start' ? command.argument : undefined,
    );
    if (access === 'denied') {
      await this.client.sendMessage(incoming.chat.id, closedBetaMessage(), undefined, signal);
      return;
    }
    if (!text) {
      await this.client.sendMessage(incoming.chat.id, commandMessage(currentLanguage, 'textOnly'), undefined, signal);
      return;
    }

    if (command?.name === 'start') {
      this.history.clear(sessionKey);
      await this.client.sendMessage(
        incoming.chat.id,
        `${message(currentLanguage, 'welcome')}\n\n${languagePrompt}`,
        languageKeyboard,
        signal,
      );
      return;
    }
    if (command?.name === 'language') {
      await this.client.sendMessage(
        incoming.chat.id,
        languagePrompt,
        languageKeyboard,
        signal,
      );
      return;
    }
    if (command?.name === 'help') {
      await this.client.sendMessage(incoming.chat.id, commandMessage(currentLanguage, 'help'), undefined, signal);
      return;
    }
    if (command?.name === 'privacy') {
      await this.client.sendMessage(incoming.chat.id, commandMessage(currentLanguage, 'privacy'), undefined, signal);
      return;
    }
    if (command?.name === 'reset') {
      this.history.clear(sessionKey);
      await this.client.sendMessage(incoming.chat.id, commandMessage(currentLanguage, 'reset'), undefined, signal);
      return;
    }
    if ((command && !isSupportedCommand(command.name)) || text.startsWith('/')) {
      await this.client.sendMessage(incoming.chat.id, commandMessage(currentLanguage, 'unknownCommand'), undefined, signal);
      return;
    }
    if (!language) {
      await this.client.sendMessage(
        incoming.chat.id,
        languagePrompt,
        languageKeyboard,
        signal,
      );
      return;
    }
    if (characterCount(text) > 2_000) {
      await this.client.sendMessage(incoming.chat.id, message(language, 'questionTooLong'), undefined, signal);
      return;
    }
    if (!this.rateLimiter.allow(sessionKey)) {
      await this.client.sendMessage(incoming.chat.id, message(language, 'rateLimited'), undefined, signal);
      return;
    }

    try {
      await this.client.sendChatAction(incoming.chat.id, signal);
    } catch {
      if (signal?.aborted) throw signal.reason ?? new Error('Telegram update aborted');
      // Typing is cosmetic and must not block or retry a question.
    }
    const progressMessageId = await this.client.sendMessage(
      incoming.chat.id,
      message(language, 'processing'),
      undefined,
      signal,
    );
    let result: AnswerRequestResult;
    try {
      result = await withDeadline(this.answers.answer({
        history: this.history.get(sessionKey),
        language,
        question: text,
      }, 'telegram'), this.answerTimeoutMs);
    } catch (error) {
      await this.replaceProgress(
        incoming.chat.id,
        progressMessageId,
        message(language, error instanceof AnswerDeadlineError ? 'answerTimedOut' : 'error'),
        signal,
      );
      return;
    }
    const [firstChunk, ...remainingChunks] = splitTelegramMessage(result.answer);
    if (!firstChunk) throw new Error('Telegram answer cannot be empty');
    await this.replaceProgress(incoming.chat.id, progressMessageId, firstChunk, signal);
    for (const chunk of remainingChunks) {
      await this.client.sendMessage(incoming.chat.id, chunk, undefined, signal);
    }
    this.history.append(sessionKey, [
      { content: text, role: 'user' },
      { content: result.answer, role: 'assistant' },
    ]);
  }

  private async handleCallback(
    callback: NonNullable<TelegramUpdate['callbackQuery']>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!callback.message || callback.message.chat.type !== 'private') {
      await this.acknowledgeCallback(callback.id, undefined, signal);
      return;
    }
    const sessionKey = this.store.sessionKey(callback.message.chat.id);
    this.store.ensureSession(sessionKey);
    if (!this.accessPolicy.isAuthorized(sessionKey)) {
      await this.acknowledgeCallback(callback.id, closedBetaMessage(), signal);
      return;
    }
    const selected = parseLanguageCallback(callback.data);
    const current = this.store.getLanguage(sessionKey) ?? 'en';
    if (!selected) {
      await this.acknowledgeCallback(callback.id, message(current, 'error'), signal);
      return;
    }
    this.store.setLanguage(sessionKey, selected);
    this.history.clear(sessionKey);
    await this.acknowledgeCallback(callback.id, message(selected, 'languageChanged'), signal);
    await this.client.sendMessage(
      callback.message.chat.id,
      message(selected, 'languageChanged'),
      undefined,
      signal,
    );
  }

  private async acknowledgeCallback(
    callbackId: string,
    text: string | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.client.answerCallbackQuery(callbackId, text, signal);
    } catch {
      if (signal?.aborted) throw signal.reason ?? new Error('Telegram update aborted');
      // Callback acknowledgements expire quickly and can also be duplicated by
      // Telegram clients. They are cosmetic and must never stop the poller or
      // prevent the durable language change and confirmation message.
    }
  }

  private async replaceProgress(
    chatId: number,
    messageId: number,
    text: string,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.client.editMessageText(chatId, messageId, text, signal);
    } catch {
      if (signal?.aborted) throw signal.reason ?? new Error('Telegram update aborted');
      // A user may delete the placeholder while the answer is being prepared.
      // Deliver the final text as a new message instead of failing the update.
      await this.client.sendMessage(chatId, text, undefined, signal);
    }
  }
}

function characterCount(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
}

class AnswerDeadlineError extends Error {
  constructor() {
    super('Telegram answer deadline exceeded');
    this.name = 'AnswerDeadlineError';
  }
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new AnswerDeadlineError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
