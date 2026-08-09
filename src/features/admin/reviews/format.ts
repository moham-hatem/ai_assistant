import type { AppLanguage } from '../../../i18n/language';

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en', sw: 'sw' };

export function formatReviewDate(value: string, language: AppLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locales[language], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
export function formatReviewLanguage(code: string, language: AppLanguage): string {
  try {
    return new Intl.DisplayNames([locales[language]], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
