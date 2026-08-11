import type { AnswerLanguage } from '../../domain.ts';

export interface TelegramBotCommand {
  command: TelegramCommandName;
  description: string;
}

export type TelegramCommandName = 'start' | 'help' | 'language' | 'privacy' | 'reset';

export interface ParsedTelegramCommand {
  argument?: string;
  name: string;
}

const descriptions: Record<AnswerLanguage, Record<TelegramCommandName, string>> = {
  ar: {
    start: 'بدء استخدام المساعد',
    help: 'عرض المساعدة والأوامر',
    language: 'تغيير لغة الإجابة',
    privacy: 'عرض معلومات الخصوصية',
    reset: 'مسح سياق المحادثة المؤقت',
  },
  en: {
    start: 'Start using the assistant',
    help: 'Show usage help and commands',
    language: 'Change the answer language',
    privacy: 'View privacy information',
    reset: 'Clear temporary conversation context',
  },
  sw: {
    start: 'Anza kutumia msaidizi',
    help: 'Onyesha msaada na amri',
    language: 'Badilisha lugha ya jibu',
    privacy: 'Tazama taarifa za faragha',
    reset: 'Futa muktadha wa muda wa mazungumzo',
  },
};

const names: TelegramCommandName[] = ['start', 'help', 'language', 'privacy', 'reset'];

export function botCommands(language: AnswerLanguage): TelegramBotCommand[] {
  return names.map((command) => ({ command, description: descriptions[language][command] }));
}

export function parseTelegramCommand(text: string): ParsedTelegramCommand | undefined {
  const match = /^\/([A-Za-z][A-Za-z0-9_]*)(?:@[A-Za-z0-9_]+)?(?:[ \t]+([^\r\n]+))?$/u.exec(text);
  if (!match) return undefined;
  const argument = match[2]?.trim();
  return { name: match[1].toLowerCase(), ...(argument ? { argument } : {}) };
}

export function isSupportedCommand(value: string | undefined): value is TelegramCommandName {
  return names.includes(value as TelegramCommandName);
}
