export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

export interface TelegramChat {
  id: number;
  type: TelegramChatType;
}

export interface TelegramMessage {
  chat: TelegramChat;
  messageId: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  data?: string;
  id: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  callbackQuery?: TelegramCallbackQuery;
  message?: TelegramMessage;
  updateId: number;
}

export function parseUpdates(value: unknown): TelegramUpdate[] {
  if (!Array.isArray(value)) throw new Error('Invalid Telegram getUpdates result');
  return value.map(parseUpdate);
}

function parseUpdate(value: unknown): TelegramUpdate {
  const record = requireRecord(value, 'update');
  const updateId = requireInteger(record.update_id, 'update_id');
  const update: TelegramUpdate = { updateId };
  if (record.callback_query !== undefined) update.callbackQuery = parseCallbackQuery(record.callback_query);
  if (record.message !== undefined) update.message = parseMessage(record.message);
  return update;
}

function parseCallbackQuery(value: unknown): TelegramCallbackQuery {
  const record = requireRecord(value, 'callback_query');
  return {
    data: optionalString(record.data, 'callback_query.data'),
    id: requireString(record.id, 'callback_query.id'),
    message: record.message === undefined ? undefined : parseMessage(record.message),
  };
}

function parseMessage(value: unknown): TelegramMessage {
  const record = requireRecord(value, 'message');
  return {
    chat: parseChat(record.chat),
    messageId: requireInteger(record.message_id, 'message.message_id'),
    text: optionalString(record.text, 'message.text'),
  };
}

function parseChat(value: unknown): TelegramChat {
  const record = requireRecord(value, 'chat');
  const type = requireString(record.type, 'chat.type');
  if (!['private', 'group', 'supergroup', 'channel'].includes(type)) {
    throw new Error('Invalid Telegram chat.type');
  }
  return { id: requireInteger(record.id, 'chat.id'), type: type as TelegramChatType };
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid Telegram ${name}`);
  }
  return value as Record<string, unknown>;
}

function requireInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid Telegram ${name}`);
  return value as number;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid Telegram ${name}`);
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid Telegram ${name}`);
  return value;
}
