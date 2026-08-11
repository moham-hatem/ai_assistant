export interface TelegramBotIdentity {
  displayName: string;
  id: number;
  link: string;
  username: string;
}

const usernamePattern = /^[A-Za-z0-9_]{5,32}$/u;

export function parseTelegramBotIdentity(value: unknown): TelegramBotIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.id) || Number(record.id) <= 0 || record.is_bot !== true) invalid();
  if (typeof record.first_name !== 'string' || record.first_name.trim().length < 1
      || record.first_name.length > 64 || /[\r\n\0]/u.test(record.first_name)) invalid();
  if (typeof record.username !== 'string' || !usernamePattern.test(record.username)
      || !/bot$/iu.test(record.username)) invalid();
  return {
    displayName: record.first_name.trim(),
    id: record.id as number,
    link: `https://t.me/${record.username}`,
    username: record.username,
  };
}

function invalid(): never {
  throw new Error('Telegram API getMe returned an invalid bot identity');
}
