import { parseUpdates, type TelegramUpdate } from './types.ts';
import type { TelegramBotCommand } from './commands.ts';
import { TelegramApiError, telegramHttpError } from './errors.ts';
import { parseTelegramBotIdentity, type TelegramBotIdentity } from './identity.ts';

type Fetch = typeof fetch;

interface TelegramEnvelope {
  ok: boolean;
  result?: unknown;
}

export class TelegramHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: Fetch;
  private readonly timeoutMs: number;

  constructor(
    token: string,
    timeoutMs: number,
    fetchImplementation: Fetch = fetch,
  ) {
    this.baseUrl = `https://api.telegram.org/bot${token}/`;
    this.timeoutMs = timeoutMs;
    this.fetchImplementation = fetchImplementation;
  }

  async getUpdates(
    offset: number | undefined,
    timeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<TelegramUpdate[]> {
    const result = await this.call('getUpdates', {
      allowed_updates: ['message', 'callback_query'],
      offset,
      timeout: timeoutSeconds,
    }, signal);
    return parseUpdates(result);
  }

  async getMe(signal?: AbortSignal): Promise<TelegramBotIdentity> {
    return parseTelegramBotIdentity(await this.call('getMe', {}, signal));
  }

  async setMyCommands(
    commands: readonly TelegramBotCommand[],
    languageCode?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    validateCommands(commands);
    if (languageCode !== undefined && !/^[a-z]{2}$/u.test(languageCode)) {
      throw new Error('Invalid Telegram command language');
    }
    const result = await this.call('setMyCommands', {
      commands,
      ...(languageCode ? { language_code: languageCode } : {}),
    }, signal);
    if (result !== true) throw new Error('Telegram API setMyCommands returned an invalid response');
  }

  async sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: unknown,
    signal?: AbortSignal,
  ): Promise<number> {
    const result = await this.call('sendMessage', {
      chat_id: chatId,
      reply_markup: replyMarkup,
      text,
    }, signal);
    const messageId = telegramMessageId(result, 'sendMessage');
    return messageId;
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
    }, signal);
    if (telegramMessageId(result, 'editMessageText') !== messageId) {
      throw new Error('Telegram API editMessageText returned an invalid response');
    }
  }

  async sendChatAction(chatId: number, signal?: AbortSignal): Promise<void> {
    const result = await this.call('sendChatAction', { action: 'typing', chat_id: chatId }, signal);
    if (result !== true) throw new Error('Telegram API sendChatAction returned an invalid response');
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    }, signal);
    if (result !== true) throw new Error('Telegram API answerCallbackQuery returned an invalid response');
  }

  private async call(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${method}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) throw telegramHttpError(method, response.status);
      const envelope = parseEnvelope(await safeJson(response), method);
      if (!envelope.ok || !('result' in envelope)) {
        throw new TelegramApiError(
          'request_rejected', `Telegram API ${method} rejected the request`, false,
        );
      }
      return envelope.result;
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? new Error('Telegram request aborted');
      if (error instanceof TelegramApiError) throw error;
      if (timedOut) {
        throw new TelegramApiError(
          'request_timeout', `Telegram API ${method} request timed out`, true,
        );
      }
      throw new TelegramApiError(
        'network_unavailable', `Telegram API ${method} request failed`, true,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

function telegramMessageId(result: unknown, method: 'editMessageText' | 'sendMessage'): number {
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || !Number.isSafeInteger((result as Record<string, unknown>).message_id)) {
    throw new Error(`Telegram API ${method} returned an invalid response`);
  }
  return (result as Record<string, number>).message_id;
}

function validateCommands(commands: readonly TelegramBotCommand[]): void {
  if (commands.length < 1 || commands.length > 100) throw new Error('Invalid Telegram commands');
  for (const command of commands) {
    if (!/^[a-z0-9_]{1,32}$/u.test(command.command)
        || command.description.length < 1 || command.description.length > 256
        || /[\r\n\0]/u.test(command.description)) {
      throw new Error('Invalid Telegram commands');
    }
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new TelegramApiError('invalid_response', 'Telegram API returned invalid JSON', false);
  }
}

function parseEnvelope(value: unknown, method: string): TelegramEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TelegramApiError('invalid_response', `Telegram API ${method} returned an invalid response`, false);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.ok !== 'boolean') {
    throw new TelegramApiError('invalid_response', `Telegram API ${method} returned an invalid response`, false);
  }
  if (record.ok && !Object.hasOwn(record, 'result')) {
    throw new TelegramApiError('invalid_response', `Telegram API ${method} returned an invalid response`, false);
  }
  return { ok: record.ok, result: record.result };
}
