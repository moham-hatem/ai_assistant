import type { AppLanguage } from '../../../i18n/language';

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en-GB', sw: 'sw-KE' };

export function formatBookDate(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(locales[language], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatBookLanguage(code: string, language: AppLanguage): string {
  try {
    return new Intl.DisplayNames([locales[language]], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
