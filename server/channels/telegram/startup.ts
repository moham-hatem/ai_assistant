import type { AnswerLanguage } from '../../domain.ts';
import type { TelegramHttpClient } from './client.ts';
import { botCommands } from './commands.ts';
import type { TelegramBotIdentity } from './identity.ts';

type StartupClient = Pick<TelegramHttpClient, 'getMe' | 'setMyCommands'>;

const commandLanguages: AnswerLanguage[] = ['en', 'ar', 'sw'];

export async function prepareTelegramBot(
  client: StartupClient,
  signal?: AbortSignal,
): Promise<TelegramBotIdentity> {
  const identity = await client.getMe(signal);
  for (const language of commandLanguages) {
    await client.setMyCommands(
      botCommands(language),
      language === 'en' ? undefined : language,
      signal,
    );
  }
  return identity;
}
