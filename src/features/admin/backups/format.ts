import type { AppLanguage } from '../../../i18n/language';

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en', sw: 'sw' };

export function formatBackupDate(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(locales[language], {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

export function formatBackupBytes(value: number, language: AppLanguage): string {
  if (value < 1_024) return `${new Intl.NumberFormat(locales[language]).format(value)} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let amount = value / 1_024;
  let unit: string = units[0];
  for (let index = 1; index < units.length && amount >= 1_024; index += 1) {
    amount /= 1_024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(locales[language], { maximumFractionDigits: 1 }).format(amount)} ${unit}`;
}
