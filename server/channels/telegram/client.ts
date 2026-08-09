import { parseUpdates, type TelegramUpdate } from './types.ts';

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

  async sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: unknown,
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.call('sendMessage', {
      chat_id: chatId,
      reply_markup: replyMarkup,
      text,
    }, signal);
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || !Number.isSafeInteger((result as Record<string, unknown>).message_id)) {
      throw new Error('Telegram API sendMessage returned an invalid response');
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
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${method}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Telegram API ${method} failed with HTTP ${response.status}`);
      const envelope = parseEnvelope(await safeJson(response), method);
      if (!envelope.ok || !('result' in envelope)) {
        throw new Error(`Telegram API ${method} rejected the request`);
      }
      return envelope.result;
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? new Error('Telegram request aborted');
      if (error instanceof Error && error.message.startsWith('Telegram API ')) throw error;
      throw new Error(`Telegram API ${method} request failed`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('Telegram API returned invalid JSON');
  }
}

function parseEnvelope(value: unknown, method: string): TelegramEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Telegram API ${method} returned an invalid response`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.ok !== 'boolean') {
    throw new Error(`Telegram API ${method} returned an invalid response`);
  }
  if (record.ok && !Object.hasOwn(record, 'result')) {
    throw new Error(`Telegram API ${method} returned an invalid response`);
  }
  return { ok: record.ok, result: record.result };
}
