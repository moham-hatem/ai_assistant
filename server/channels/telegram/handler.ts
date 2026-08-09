import type { AnswerRequestResult } from '../../answer-request-service.ts';
import type { AnswerInput, AnswerLanguage } from '../../domain.ts';
import type { TelegramHttpClient } from './client.ts';
import { TelegramHistory } from './history.ts';
import {
  languageKeyboard,
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
  'answerCallbackQuery' | 'sendChatAction' | 'sendMessage'>;

export class TelegramUpdateHandler {
  private readonly answers: AnswerRequests;
  private readonly client: TelegramClient;
  private readonly history: TelegramHistory;
  private readonly rateLimiter: TelegramRateLimiter;
  private readonly store: TelegramStore;

  constructor(
    answers: AnswerRequests,
    client: TelegramClient,
    store: TelegramStore,
    history: TelegramHistory,
    rateLimiter: TelegramRateLimiter,
  ) {
    this.answers = answers;
    this.client = client;
    this.store = store;
    this.history = history;
    this.rateLimiter = rateLimiter;
  }

  async handle(update: TelegramUpdate, signal?: AbortSignal): Promise<void> {
    if (update.callbackQuery) {
      await this.handleCallback(update.callbackQuery, signal);
      return;
    }
    if (update.message) await this.handleMessage(update.message, signal);
  }

  private async handleMessage(incoming: TelegramMessage, signal?: AbortSignal): Promise<void> {
    if (incoming.chat.type !== 'private' || incoming.text === undefined) return;
    const text = incoming.text.trim();
    if (!text) return;
    const sessionKey = this.store.sessionKey(incoming.chat.id);
    this.store.ensureSession(sessionKey);
    const language = this.store.getLanguage(sessionKey);

    if (isCommand(text, 'start')) {
      this.history.clear(sessionKey);
      await this.client.sendMessage(
        incoming.chat.id,
        `${message(language ?? 'en', 'welcome')}\n\n${message(language ?? 'en', 'chooseLanguage')}`,
        languageKeyboard,
        signal,
      );
      return;
    }
    if (isCommand(text, 'language')) {
      await this.client.sendMessage(
        incoming.chat.id,
        message(language ?? 'en', 'chooseLanguage'),
        languageKeyboard,
        signal,
      );
      return;
    }
    if (!language) {
      await this.client.sendMessage(
        incoming.chat.id,
        message('en', 'chooseLanguage'),
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
    let result: AnswerRequestResult;
    try {
      result = await this.answers.answer({
        history: this.history.get(sessionKey),
        language,
        question: text,
      }, 'telegram');
    } catch {
      await this.client.sendMessage(incoming.chat.id, message(language, 'error'), undefined, signal);
      return;
    }
    for (const chunk of splitTelegramMessage(result.answer)) {
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
      await this.client.answerCallbackQuery(callback.id, undefined, signal);
      return;
    }
    const sessionKey = this.store.sessionKey(callback.message.chat.id);
    this.store.ensureSession(sessionKey);
    const selected = parseLanguageCallback(callback.data);
    const current = this.store.getLanguage(sessionKey) ?? 'en';
    if (!selected) {
      await this.client.answerCallbackQuery(callback.id, message(current, 'error'), signal);
      return;
    }
    this.store.setLanguage(sessionKey, selected);
    this.history.clear(sessionKey);
    await this.client.answerCallbackQuery(callback.id, message(selected, 'languageChanged'), signal);
    await this.client.sendMessage(
      callback.message.chat.id,
      message(selected, 'languageChanged'),
      undefined,
      signal,
    );
  }
}

function isCommand(text: string, command: string): boolean {
  return new RegExp(`^/${command}(?:@[A-Za-z0-9_]+)?$`, 'i').test(text);
}

function characterCount(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
}
